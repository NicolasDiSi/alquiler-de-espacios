"use client";

import { useMemo } from "react";

import type { OperatorFacilityView, OperatorRoomView } from "@espacios/application";
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

import { RecordStatusDot } from "../../../_components/status";
import { DeactivateRoomButton } from "./deactivate-room-button";
import { EditRoomDialog } from "./edit-room-dialog";

const helper = createAppColumnHelper<OperatorRoomView>();

/** The rooms of one sede (spec 0005, AC-6). Edit and retire only while the sede and the room are active. */
export function RoomList({
  facility,
  rooms,
}: {
  readonly facility: OperatorFacilityView;
  readonly rooms: readonly OperatorRoomView[];
}) {
  const t = useTranslations("operator.room");
  const status = useTranslations("operator.status");
  const { timeZone } = facility;
  const editable = facility.status === "active";
  const dates = useZonedDates(timeZone);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          sortFn: "text",
          meta: { label: t("columns.name"), card: "title", searchable: true },
        }),
        helper.accessor("capacity", { sortFn: "basic", meta: { label: t("columns.capacity"), align: "end" } }),
        helper.accessor("activeFrom", {
          sortFn: "instant",
          meta: { label: t("columns.activeFrom") },
          cell: ({ getValue }) => dates.day(getValue()),
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
        helper.display({
          id: "actions",
          meta: { label: t("columns.actions"), card: "actions", align: "end" },
          cell: ({ row }) =>
            editable && row.original.status === "active" ? (
              <div className="flex justify-end gap-1">
                <EditRoomDialog room={row.original} timeZone={timeZone} />
                <DeactivateRoomButton room={row.original} timeZone={timeZone} />
              </div>
            ) : null,
        }),
      ]),
    [t, status, dates, editable, timeZone],
  );

  const table = useAppTable({
    data: rooms as OperatorRoomView[],
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
          {rooms.length >= DATA_TABLE_SEARCH_FROM ? <DataTableSearch label={t("search")} /> : null}
          <DataTableFacetFilter columnId="status" />
        </DataTableToolbar>
        <DataTableContent caption={t("caption")} />
        <DataTablePagination />
      </DataTableFrame>
    </table.AppTable>
  );
}
