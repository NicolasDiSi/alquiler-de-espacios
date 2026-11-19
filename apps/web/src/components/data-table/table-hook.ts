import {
  columnFacetingFeature,
  columnFilteringFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";

import { filterFn_oneOf, filterFn_search, sortFn_instant } from "./table-fns";

/**
 * What a column tells the shared parts (spec 0005): the label (header and card term, already translated), where the
 * column goes in a phone card, the choices of its facet filter, and whether the search reads it.
 */
export type DataTableColumnMeta = {
  readonly label: string;
  /** `title` heads the card, `badge` sits beside it, `detail` is a term and value, `actions` closes it. */
  readonly card?: "title" | "badge" | "detail" | "actions";
  /** A facet filter for this column: each value with its label. The value is what the accessor returns. */
  readonly filter?: { readonly options: readonly { readonly value: string; readonly label: string }[] };
  /** The search box looks in this column. */
  readonly searchable?: true;
  readonly align?: "end";
};

/**
 * The one table setup of the app (TanStack Table v9, `createTableHook`): client side sorting, facet filters with
 * counts, a search across the columns that opt in, and pages. Every list loads its whole, small collection on the
 * server and lets the operator narrow it here. Markup and accessibility live in `data-table.tsx`.
 */
const hook = createTableHook({
  features: tableFeatures({
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text, instant: sortFn_instant },
    columnFilteringFeature,
    globalFilteringFeature,
    filteredRowModel: createFilteredRowModel(),
    filterFns: { oneOf: filterFn_oneOf, search: filterFn_search },
    columnFacetingFeature,
    facetedRowModel: createFacetedRowModel(),
    facetedUniqueValues: createFacetedUniqueValues(),
    rowPaginationFeature,
    paginatedRowModel: createPaginatedRowModel(),
    columnMeta: metaHelper<DataTableColumnMeta>(),
  }),
  getRowId: (row: { readonly id: string }) => row.id,
  globalFilterFn: "search",
  // The factory options do not see the meta slot's type, so the column's meta is read as ours here.
  getColumnCanGlobalFilter: (column) => (column.columnDef.meta as DataTableColumnMeta | undefined)?.searchable === true,
});

export const { createAppColumnHelper, useAppTable, useTableContext } = hook;
export type AppFeatures = typeof hook.appFeatures;

/** Page size of every list. Small collections; pages keep a long one scannable. */
export const DATA_TABLE_PAGE_SIZE = 10;

/** A short list (a sede's rooms, its blocks) shows the search box only from this many rows: below it, reading is faster. */
export const DATA_TABLE_SEARCH_FROM = 8;
