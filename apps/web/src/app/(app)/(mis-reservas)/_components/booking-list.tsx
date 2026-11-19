"use client";

import { useMemo, useState } from "react";

import type { BookingView, MyBookingsView } from "@espacios/application";
import type { BookingPhase } from "@espacios/domain";
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
import { Badge } from "@/components/ui/badge";

import { CancelBookingButton } from "./cancel-booking-button";

const helper = createAppColumnHelper<BookingView>();

/** Text carries the state; the badge style only reinforces it (never color alone). */
const PHASE_VARIANT: Record<BookingPhase, "secondary" | "outline"> = {
  upcoming: "outline",
  in_progress: "secondary",
  finished: "outline",
  cancelled: "outline",
};

/** The phases a view can hold, so its state filter offers only those. */
const VIEW_PHASES: Record<MyBookingsView, readonly BookingPhase[]> = {
  upcoming: ["upcoming", "in_progress"],
  past: ["finished"],
  cancelled: ["cancelled"],
};

const distinct = (values: readonly string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "es"));

export type BookingListProps = {
  readonly view: MyBookingsView;
  /** The view's bookings in its own order: Próximas soonest first, Pasadas and Canceladas latest first. */
  readonly bookings: readonly BookingView[];
  /** The view had more bookings than the page read. */
  readonly capped: boolean;
  /** The booking the search just created: marked "Nueva", and the table opens on its page. */
  readonly newId: string | null;
};

/**
 * One view of Mis reservas (spec 0003, amended): the same table as every list of the app (spec 0005). Search by room,
 * sede or member, filter by sede, member and (in Próximas) state, sort by date, pages of ten. A table from `md` up,
 * cards below.
 */
export function BookingList({ view, bookings: initial, capped, newId }: BookingListProps) {
  const t = useTranslations("home");
  const format = useFormatter();
  const [bookings, setBookings] = useState(initial);

  const columns = useMemo(() => {
    /** A cancelled booking leaves this view; the server decided it, and Canceladas reads it on its next visit. */
    const dropRow = (id: string) => setBookings((current) => current.filter((booking) => booking.id !== id));
    const date = (iso: string) => format.dateTime(new Date(iso), "short");
    const time = (booking: BookingView) =>
      t("timeRange", {
        start: format.dateTime(new Date(booking.startsAt), "time"),
        end: format.dateTime(new Date(booking.endsAt), "time"),
      });
    const option = (value: string) => ({ value, label: value });

    return helper.columns([
      helper.accessor("startsAt", {
        sortFn: "instant",
        meta: { label: t("columns.date"), card: "title" },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span>{date(row.original.startsAt)}</span>
            <span className="text-muted-foreground text-xs font-normal">{time(row.original)}</span>
          </span>
        ),
      }),
      helper.accessor((booking) => booking.room.name, {
        id: "room",
        sortFn: "text",
        meta: { label: t("columns.room"), searchable: true },
        cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      }),
      helper.accessor((booking) => booking.room.facilityName, {
        id: "facility",
        sortFn: "text",
        filterFn: "oneOf",
        meta: {
          label: t("columns.facility"),
          searchable: true,
          filter: { options: distinct(initial.map((booking) => booking.room.facilityName)).map(option) },
        },
      }),
      helper.accessor((booking) => booking.bookedBy.name, {
        id: "bookedBy",
        sortFn: "text",
        filterFn: "oneOf",
        meta: {
          label: t("columns.bookedBy"),
          searchable: true,
          filter: { options: distinct(initial.map((booking) => booking.bookedBy.name)).map(option) },
        },
      }),
      helper.accessor("phase", {
        filterFn: "oneOf",
        meta: {
          label: t("columns.status"),
          card: "badge",
          ...(view === "upcoming"
            ? { filter: { options: VIEW_PHASES[view].map((phase) => ({ value: phase, label: t(`phase.${phase}`) })) } }
            : {}),
        },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant={PHASE_VARIANT[row.original.phase]}>{t(`phase.${row.original.phase}`)}</Badge>
            {row.original.id === newId ? <Badge>{t("newBadge")}</Badge> : null}
          </span>
        ),
      }),
      helper.accessor("createdAt", {
        sortFn: "instant",
        meta: { label: t("columns.createdAt") },
        cell: ({ getValue }) => format.dateTime(new Date(getValue()), "dateTime"),
      }),
      ...(view === "cancelled"
        ? [
            helper.accessor((booking) => booking.cancelledAt ?? "", {
              id: "cancelledAt",
              sortFn: "instant",
              meta: { label: t("columns.cancelledAt") },
              cell: ({ getValue }) => (getValue() ? format.dateTime(new Date(getValue()), "dateTime") : null),
            }),
          ]
        : []),
      // Only a confirmed booking that has not started can be cancelled; the server decides again on every attempt.
      ...(view === "upcoming"
        ? [
            helper.display({
              id: "actions",
              meta: { label: t("columns.actions"), card: "actions", align: "end" },
              cell: ({ row }) =>
                row.original.phase === "upcoming" ? (
                  <CancelBookingButton
                    booking={row.original}
                    summary={{
                      room: row.original.room.name,
                      date: date(row.original.startsAt),
                      time: time(row.original),
                    }}
                    onGone={dropRow}
                  />
                ) : null,
            }),
          ]
        : []),
    ]);
  }, [t, format, view, initial, newId]);

  // The rows come in the view's order, which is also the table's first sort: the new booking's index gives its page.
  const newIndex = newId ? initial.findIndex((booking) => booking.id === newId) : -1;
  const table = useAppTable({
    data: bookings as BookingView[],
    columns,
    initialState: {
      sorting: [{ id: "startsAt", desc: view !== "upcoming" }],
      pagination: {
        pageIndex: newIndex > 0 ? Math.floor(newIndex / DATA_TABLE_PAGE_SIZE) : 0,
        pageSize: DATA_TABLE_PAGE_SIZE,
      },
    },
  });

  return (
    <table.AppTable>
      <DataTableFrame>
        <DataTableToolbar>
          <DataTableSearch label={t("search")} />
          <DataTableFacetFilter columnId="facility" />
          <DataTableFacetFilter columnId="bookedBy" />
          <DataTableFacetFilter columnId="phase" />
        </DataTableToolbar>
        <DataTableContent caption={t(`captions.${view}`)} />
        <DataTablePagination />
        {capped ? <p className="text-muted-foreground px-4 pb-3 text-xs">{t(`capped.${view}`)}</p> : null}
      </DataTableFrame>
    </table.AppTable>
  );
}
