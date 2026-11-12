"use client";

import { useMemo } from "react";

import Link from "next/link";

import type { OperatorDashboard } from "@espacios/application";
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
import { Progress } from "@/components/ui/progress";
import { formatHours, formatInteger, formatPercent } from "@/lib/operator/metric-format";

import { StatusDot } from "../_components/status";

type CompanyRow = OperatorDashboard["companies"][number];

const helper = createAppColumnHelper<CompanyRow>();

/** An unknown rate or share sorts below every real one (it is shown as a dash). */
const sortable = (value: number | null) => value ?? -1;

/**
 * Consumo por empresa (spec 0006): every company of the period, most booked first. Search by name, filter by kind and
 * state, sort any figure, ten per page. Idle and inactive companies stay in the list, so sorting by hours finds them.
 */
export function CompanyUsageList({ companies }: { readonly companies: OperatorDashboard["companies"] }) {
  const t = useTranslations("operator.dashboard.companies");
  const kinds = useTranslations("operator.client.kinds");
  const status = useTranslations("operator.status");
  const none = useTranslations("operator.dashboard")("none");

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("rank", {
          sortFn: "basic",
          meta: { label: t("columns.rank"), align: "end" },
          cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
        }),
        helper.accessor("name", {
          sortFn: "text",
          meta: { label: t("columns.company"), card: "title", searchable: true },
          cell: ({ row }) => (
            <Link
              href={`/operador/clientes/${row.original.id}`}
              className="text-primary font-medium underline-offset-4 hover:underline"
            >
              {row.original.name}
            </Link>
          ),
        }),
        helper.accessor("kind", {
          filterFn: "oneOf",
          meta: {
            label: t("columns.kind"),
            filter: {
              options: [
                { value: "company", label: kinds("company") },
                { value: "individual", label: kinds("individual") },
              ],
            },
          },
          cell: ({ getValue }) => kinds(getValue()),
        }),
        helper.accessor((row) => (row.active ? "active" : "inactive"), {
          id: "status",
          filterFn: "oneOf",
          meta: {
            label: t("columns.status"),
            card: "badge",
            filter: {
              options: [
                { value: "active", label: status("filter.active", { gender: "m" }) },
                { value: "inactive", label: status("filter.inactive", { gender: "m" }) },
              ],
            },
          },
          cell: ({ row }) =>
            row.original.active ? (
              <StatusDot tone="success">{t("states.active")}</StatusDot>
            ) : (
              <StatusDot tone="neutral">{t("states.inactive")}</StatusDot>
            ),
        }),
        helper.accessor("bookedMinutes", {
          sortFn: "basic",
          meta: { label: t("columns.hours"), align: "end" },
          cell: ({ getValue }) => formatHours(getValue()),
        }),
        helper.accessor("confirmedCount", {
          sortFn: "basic",
          meta: { label: t("columns.bookings"), align: "end" },
          cell: ({ getValue }) => formatInteger(getValue()),
        }),
        helper.accessor((row) => sortable(row.cancellationRate), {
          id: "cancellation",
          sortFn: "basic",
          meta: { label: t("columns.cancellation"), align: "end" },
          cell: ({ row }) =>
            row.original.cancellationRate === null ? none : formatPercent(row.original.cancellationRate),
        }),
        helper.accessor((row) => sortable(row.share), {
          id: "share",
          sortFn: "basic",
          meta: { label: t("columns.share") },
          cell: ({ row }) => (
            <span className="flex min-w-32 flex-col gap-1.5">
              <span className="text-xs tabular-nums">
                {row.original.share === null ? none : formatPercent(row.original.share)}
              </span>
              <Progress
                aria-label={t("shareOf", { name: row.original.name })}
                className="h-1.5"
                value={(row.original.share ?? 0) * 100}
              />
            </span>
          ),
        }),
      ]),
    [t, kinds, status, none],
  );

  const table = useAppTable({
    data: companies as CompanyRow[],
    columns,
    initialState: {
      sorting: [{ id: "rank", desc: false }],
      pagination: { pageIndex: 0, pageSize: DATA_TABLE_PAGE_SIZE },
    },
  });

  const heading = (
    <div className="space-y-1.5 md:border-b md:px-4 md:py-4">
      <h2 className="leading-none font-semibold">{t("title")}</h2>
      <p className="text-muted-foreground text-sm">{t("description")}</p>
    </div>
  );

  // No company at all is this section's own empty state, not "no results with these filters".
  if (companies.length === 0) {
    return (
      <DataTableFrame>
        {heading}
        <p className="text-muted-foreground text-sm md:px-4 md:py-6">{t("empty")}</p>
      </DataTableFrame>
    );
  }

  return (
    <table.AppTable>
      <DataTableFrame>
        {heading}
        <DataTableToolbar>
          <DataTableSearch label={t("search")} />
          <DataTableFacetFilter columnId="kind" />
          <DataTableFacetFilter columnId="status" />
        </DataTableToolbar>
        <DataTableContent caption={t("caption")} />
        <DataTablePagination />
      </DataTableFrame>
    </table.AppTable>
  );
}
