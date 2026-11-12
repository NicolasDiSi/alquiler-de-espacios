"use client";

import { useMemo } from "react";

import Link from "next/link";

import type { OperatorClientView } from "@espacios/application";
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

import { RecordStatusDot } from "../../_components/status";
import { ClientAvatar } from "./client-avatar";

const helper = createAppColumnHelper<OperatorClientView>();

/** Every client (spec 0005, AC-8): search by name or code, filter by kind and state (active by default). */
export function ClientList({ clients }: { readonly clients: readonly OperatorClientView[] }) {
  const t = useTranslations("operator.client");
  const status = useTranslations("operator.status");

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          sortFn: "text",
          meta: { label: t("columns.name"), card: "title", searchable: true },
          cell: ({ row }) => (
            <span className="flex items-center gap-3">
              <ClientAvatar name={row.original.name} logoUrl={row.original.logoUrl} />
              <Link
                href={`/operador/clientes/${row.original.id}`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                {row.original.name}
              </Link>
            </span>
          ),
        }),
        helper.accessor("slug", { sortFn: "text", meta: { label: t("columns.slug"), searchable: true } }),
        helper.accessor("kind", {
          filterFn: "oneOf",
          meta: {
            label: t("columns.kind"),
            filter: {
              options: [
                { value: "company", label: t("kinds.company") },
                { value: "individual", label: t("kinds.individual") },
              ],
            },
          },
          cell: ({ getValue }) => t(`kinds.${getValue()}`),
        }),
        helper.accessor("status", {
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
          cell: ({ row }) => (
            <RecordStatusDot status={row.original.status} since={row.original.deactivatedAt} gender="m" />
          ),
        }),
      ]),
    [t, status],
  );

  const table = useAppTable({
    data: clients as OperatorClientView[],
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
          <DataTableFacetFilter columnId="kind" />
          <DataTableFacetFilter columnId="status" />
        </DataTableToolbar>
        <DataTableContent caption={t("caption")} />
        <DataTablePagination />
      </DataTableFrame>
    </table.AppTable>
  );
}
