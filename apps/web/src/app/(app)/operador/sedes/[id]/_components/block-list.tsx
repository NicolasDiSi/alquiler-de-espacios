"use client";

import { useMemo } from "react";

import type { OperatorBlockView, OperatorFacilityView } from "@espacios/application";
import { useTranslations } from "next-intl";

import {
  DataTableContent,
  DataTableFacetFilter,
  DataTableFrame,
  DataTablePagination,
  DataTableSearch,
  DataTableToolbar,
} from "@/components/data-table/data-table";
import {
  createAppColumnHelper,
  DATA_TABLE_PAGE_SIZE,
  DATA_TABLE_SEARCH_FROM,
  useAppTable,
} from "@/components/data-table/table-hook";
import { useZonedDates } from "@/hooks/use-zoned-dates";

import { StatusDot } from "../../../_components/status";
import { ReleaseBlockButton } from "./release-block-button";

const helper = createAppColumnHelper<OperatorBlockView>();

/**
 * The blocks of one sede (spec 0005, AC-7), in the sede's zone. Active ones by default; finished and released ones
 * through the state filter. Only an active block can be released, and only while the sede is active.
 */
export function BlockList({
  facility,
  blocks,
}: {
  readonly facility: OperatorFacilityView;
  readonly blocks: readonly OperatorBlockView[];
}) {
  const t = useTranslations("operator.block");
  const { timeZone } = facility;
  const releasable = facility.status === "active";
  const dates = useZonedDates(timeZone);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((block) => block.room?.name ?? t("wholeFacility"), {
          id: "scope",
          sortFn: "text",
          meta: { label: t("columns.scope"), card: "title", searchable: true },
        }),
        helper.accessor("startsAt", {
          sortFn: "instant",
          meta: { label: t("columns.from") },
          cell: ({ getValue }) => dates.moment(getValue()),
        }),
        helper.accessor("endsAt", {
          sortFn: "instant",
          meta: { label: t("columns.to") },
          cell: ({ getValue }) => dates.moment(getValue()),
        }),
        helper.accessor("reason", { sortFn: "text", meta: { label: t("columns.reason"), searchable: true } }),
        helper.accessor("phase", {
          filterFn: "oneOf",
          meta: {
            label: t("columns.status"),
            card: "badge",
            filter: {
              options: [
                { value: "active", label: t("states.active") },
                { value: "finished", label: t("states.finished") },
                { value: "released", label: t("states.released") },
              ],
            },
          },
          cell: ({ getValue }) => (
            <StatusDot tone={getValue() === "active" ? "info" : "neutral"}>{t(`states.${getValue()}`)}</StatusDot>
          ),
        }),
        helper.display({
          id: "actions",
          meta: { label: t("columns.actions"), card: "actions", align: "end" },
          cell: ({ row }) =>
            releasable && row.original.phase === "active" ? (
              <ReleaseBlockButton block={row.original} timeZone={timeZone} />
            ) : null,
        }),
      ]),
    [t, dates, releasable, timeZone],
  );

  const table = useAppTable({
    data: blocks as OperatorBlockView[],
    columns,
    initialState: {
      sorting: [{ id: "startsAt", desc: false }],
      columnFilters: [{ id: "phase", value: ["active"] }],
      pagination: { pageIndex: 0, pageSize: DATA_TABLE_PAGE_SIZE },
    },
  });

  return (
    <table.AppTable>
      <DataTableFrame>
        <DataTableToolbar>
          {blocks.length >= DATA_TABLE_SEARCH_FROM ? <DataTableSearch label={t("search")} /> : null}
          <DataTableFacetFilter columnId="phase" />
        </DataTableToolbar>
        <DataTableContent caption={t("caption", { zone: timeZone })} />
        <DataTablePagination />
      </DataTableFrame>
    </table.AppTable>
  );
}
