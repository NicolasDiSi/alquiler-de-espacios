"use client";

import { useMemo } from "react";

import type { OperatorMemberView } from "@espacios/application";
import { useFormatter, useTranslations } from "next-intl";

import { DataTableContent, DataTableFrame, DataTablePagination } from "@/components/data-table/data-table";
import { createAppColumnHelper, DATA_TABLE_PAGE_SIZE, useAppTable } from "@/components/data-table/table-hook";

const helper = createAppColumnHelper<OperatorMemberView>();

/** A client's members (spec 0005, AC-9), sortable by name or date. Few rows, so no search or filters. */
export function MemberList({ members }: { readonly members: readonly OperatorMemberView[] }) {
  const t = useTranslations("operator.member");
  const format = useFormatter();

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", { sortFn: "text", meta: { label: t("columns.name"), card: "title" } }),
        helper.accessor("createdAt", {
          sortFn: "instant",
          meta: { label: t("columns.since") },
          cell: ({ getValue }) => format.dateTime(new Date(getValue()), "short"),
        }),
      ]),
    [t, format],
  );

  const table = useAppTable({
    data: members as OperatorMemberView[],
    columns,
    initialState: {
      sorting: [{ id: "name", desc: false }],
      pagination: { pageIndex: 0, pageSize: DATA_TABLE_PAGE_SIZE },
    },
  });

  return (
    <table.AppTable>
      <DataTableFrame>
        <DataTableContent caption={t("caption")} />
        <DataTablePagination />
      </DataTableFrame>
    </table.AppTable>
  );
}
