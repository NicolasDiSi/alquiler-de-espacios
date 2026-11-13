"use client";

import { useMemo } from "react";

import type { OperatorBookingView } from "@espacios/application";
import { cn } from "cn";
import { useFormatter, useTranslations } from "next-intl";

import {
  DataTableContent,
  DataTableFacetFilter,
  DataTableFrame,
  DataTablePagination,
  DataTableSearch,
  DataTableToolbar,
} from "@/components/data-table/data-table";
import { createAppColumnHelper, DATA_TABLE_PAGE_SIZE, useAppTable } from "@/components/data-table/table-hook";
import { formatDecimalHours } from "@/lib/operator/metric-format";

import { StatusDot } from "../status";
import type { ActivitySubject } from "./subject";

const helper = createAppColumnHelper<OperatorBookingView>();

const PHASES = ["finished", "in_progress", "upcoming", "cancelled"] as const;
const TONE = { finished: "neutral", in_progress: "info", upcoming: "success", cancelled: "neutral" } as const;

const hoursOf = (booking: OperatorBookingView) =>
  (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 3_600_000;

/**
 * Every booking of a client, a sede or every sede in the period, newest first (spec 0007, AC-4): search by room, sede
 * (or client, for a sede or every sede) or member, filter by state and client, sort by date or hours. A cancelled
 * booking computes no hours and reads struck through.
 */
export function BookingHistory({
  bookings,
  capped,
  subject,
}: {
  readonly bookings: readonly OperatorBookingView[];
  /** The period had more bookings than were read. */
  readonly capped: boolean;
  readonly subject: ActivitySubject;
}) {
  const t = useTranslations("operator.activity.history");
  const home = useTranslations("home");
  const format = useFormatter();
  const clients = useMemo(
    () => [...new Set(bookings.map((booking) => booking.company.name))].sort((a, b) => a.localeCompare(b)),
    [bookings],
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("startsAt", {
          sortFn: "instant",
          meta: { label: t("columns.date"), card: "title" },
          cell: ({ row }) => (
            <span className="flex flex-col">
              <span>{format.dateTime(new Date(row.original.startsAt), "short")}</span>
              <span className="text-muted-foreground text-xs">
                {home("timeRange", {
                  start: format.dateTime(new Date(row.original.startsAt), "time"),
                  end: format.dateTime(new Date(row.original.endsAt), "time"),
                })}
              </span>
            </span>
          ),
        }),
        helper.accessor((row) => `${row.room.name} ${row.room.facilityName}`, {
          id: "room",
          sortFn: "text",
          meta: { label: t("columns.room"), searchable: true },
          cell: ({ row }) => (
            <span className="flex flex-col">
              <span>{row.original.room.name}</span>
              <span className="text-muted-foreground text-xs">{row.original.room.facilityName}</span>
            </span>
          ),
        }),
        // A sede's history mixes clients, so it says whose each booking is; a client's would repeat its own name.
        ...(subject === "client"
          ? []
          : [
              helper.accessor((row) => row.company.name, {
                id: "company",
                sortFn: "text",
                filterFn: "oneOf",
                meta: {
                  label: t("columns.client"),
                  searchable: true,
                  filter: { options: clients.map((name) => ({ value: name, label: name })) },
                },
              }),
            ]),
        helper.accessor((row) => row.bookedBy.name, {
          id: "bookedBy",
          sortFn: "text",
          meta: { label: t("columns.bookedBy"), searchable: true },
        }),
        helper.accessor("phase", {
          filterFn: "oneOf",
          meta: {
            label: t("columns.status"),
            card: "badge",
            filter: { options: PHASES.map((phase) => ({ value: phase, label: home(`phase.${phase}`) })) },
          },
          cell: ({ getValue }) => <StatusDot tone={TONE[getValue()]}>{home(`phase.${getValue()}`)}</StatusDot>,
        }),
        helper.accessor((row) => (row.status === "cancelled" ? 0 : hoursOf(row)), {
          id: "hours",
          sortFn: "basic",
          meta: { label: t("columns.hours"), align: "end" },
          cell: ({ row }) => (
            <span className={cn(row.original.status === "cancelled" && "text-muted-foreground line-through")}>
              {formatDecimalHours(row.original.status === "cancelled" ? 0 : hoursOf(row.original))}
            </span>
          ),
        }),
      ]),
    [t, home, format, subject, clients],
  );

  const table = useAppTable({
    data: bookings as OperatorBookingView[],
    columns,
    initialState: {
      sorting: [{ id: "startsAt", desc: true }],
      pagination: { pageIndex: 0, pageSize: DATA_TABLE_PAGE_SIZE },
    },
  });

  const heading = (
    <div className="space-y-1.5 md:border-b md:px-4 md:py-4">
      <h3 className="leading-none font-semibold">{t("title")}</h3>
      <p className="text-muted-foreground text-sm">{t(`description.${subject}`)}</p>
    </div>
  );

  // No booking at all in the period is this section's own empty state, not "no results with these filters".
  if (bookings.length === 0) {
    return (
      <DataTableFrame>
        {heading}
        <p className="text-muted-foreground text-sm md:px-4 md:py-6">{t(`empty.${subject}`)}</p>
      </DataTableFrame>
    );
  }

  return (
    <table.AppTable>
      <DataTableFrame>
        {heading}
        <DataTableToolbar>
          <DataTableSearch label={t(`search.${subject}`)} />
          <DataTableFacetFilter columnId="phase" />
          <DataTableFacetFilter columnId="company" />
        </DataTableToolbar>
        <DataTableContent caption={t(`caption.${subject}`)} />
        <DataTablePagination />
        {capped ? <p className="text-muted-foreground px-4 pb-3 text-xs">{t("capped")}</p> : null}
      </DataTableFrame>
    </table.AppTable>
  );
}
