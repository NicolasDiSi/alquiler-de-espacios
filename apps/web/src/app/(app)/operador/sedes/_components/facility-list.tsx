"use client";

import { useMemo } from "react";

import Link from "next/link";

import type { OperatorFacilityView } from "@espacios/application";
import { useTranslations } from "next-intl";

import {
  DataTableContent,
  DataTableFacetFilter,
  DataTableFrame,
  DataTablePagination,
  DataTableSearch,
  DataTableToolbar,
} from "@/components/data-table/data-table";
import { createAppColumnHelper, DATA_TABLE_PAGE_SIZE, useAppTable } from "@/components/data-table/table-hook";
import { WeekDays } from "@/components/week-days";
import { zoneLabel } from "@/lib/operator/format";

import { RecordStatusDot } from "../../_components/status";

const helper = createAppColumnHelper<OperatorFacilityView>();

/**
 * Every sede (spec 0005, AC-2), active and retired, narrowed here: search by name or address, filter by state (active
 * by default) and zone, sort any column. A table from `md` up, cards below.
 */
export function FacilityList({ facilities }: { readonly facilities: readonly OperatorFacilityView[] }) {
  const t = useTranslations("operator.facility");
  const status = useTranslations("operator.status");

  const columns = useMemo(() => {
    const zones = [...new Set(facilities.map((facility) => facility.timeZone))].sort();
    return helper.columns([
      helper.accessor("name", {
        sortFn: "text",
        meta: { label: t("columns.name"), card: "title", searchable: true },
        cell: ({ row }) => (
          <Link
            href={`/operador/sedes/${row.original.id}`}
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      }),
      helper.accessor((facility) => facility.address ?? "", {
        id: "address",
        sortFn: "text",
        meta: { label: t("columns.address"), searchable: true },
        cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">{t("noAddress")}</span>,
      }),
      helper.accessor("timeZone", {
        filterFn: "oneOf",
        meta: {
          label: t("columns.timeZone"),
          filter: { options: zones.map((zone) => ({ value: zone, label: zoneLabel(zone) })) },
        },
        cell: ({ getValue }) => zoneLabel(getValue()),
      }),
      helper.accessor((facility) => `${facility.opensAt}-${facility.closesAt}`, {
        id: "hours",
        meta: { label: t("columns.hours") },
        cell: ({ row }) => (
          <span className="tabular-nums">{t("hours", { from: row.original.opensAt, to: row.original.closesAt })}</span>
        ),
      }),
      helper.display({
        id: "days",
        meta: { label: t("columns.days") },
        cell: ({ row }) => <WeekDays open={row.original.openWeekdays} />,
      }),
      helper.accessor("activeRooms", {
        sortFn: "basic",
        meta: { label: t("columns.rooms"), align: "end" },
      }),
      helper.accessor("status", {
        filterFn: "oneOf",
        meta: {
          label: t("columns.status"),
          card: "badge",
          filter: {
            options: [
              { value: "active", label: status("filter.active", { gender: "f" }) },
              { value: "inactive", label: status("filter.inactive", { gender: "f" }) },
            ],
          },
        },
        cell: ({ row }) => (
          <RecordStatusDot status={row.original.status} since={row.original.deactivatedAt} gender="f" />
        ),
      }),
    ]);
  }, [facilities, t, status]);

  const table = useAppTable({
    data: facilities as OperatorFacilityView[],
    columns,
    initialState: {
      sorting: [{ id: "name", desc: false }],
      columnFilters: [{ id: "status", value: ["active"] }],
      pagination: { pageIndex: 0, pageSize: DATA_TABLE_PAGE_SIZE },
    },
  });

  return (
    <table.AppTable>
      <DataTableFrame>
        <DataTableToolbar>
          <DataTableSearch label={t("search")} />
          <DataTableFacetFilter columnId="status" />
          <DataTableFacetFilter columnId="timeZone" />
        </DataTableToolbar>
        <DataTableContent caption={t("caption")} />
        <DataTablePagination />
      </DataTableFrame>
    </table.AppTable>
  );
}
