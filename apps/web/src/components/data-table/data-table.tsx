"use client";

import { type ReactNode, useId } from "react";

import type { Header } from "@tanstack/react-table";
import { cn } from "cn";
import { ArrowDown, ArrowUp, ChevronsUpDown, ListFilter, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { type AppFeatures, type DataTableColumnMeta, useTableContext } from "./table-hook";

/**
 * The shared parts of every list (spec 0005), composed inside `table.AppTable`: each reads the table from context, so
 * a list only declares its columns and picks the parts it needs. Native table semantics (a caption, column headers,
 * `aria-sort`), never `role="grid"`: rows hold links and buttons, not cells to navigate.
 */

const metaOf = (column: { columnDef: { meta?: unknown } }) => column.columnDef.meta as DataTableColumnMeta | undefined;

/**
 * One collection, one frame: the toolbar, the rows and the pages share a single container from `md` up. Below `md` the
 * frame steps back and the rows stand as cards.
 */
export function DataTableFrame({ children }: { readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 md:gap-0 md:rounded-lg md:border md:bg-card md:shadow-sm">
      {children}
    </section>
  );
}

/**
 * The row above the results: what narrows the rows already loaded (search and facets), the visible of total count at
 * its end, and the active filters as removable chips under it when there are any.
 */
export function DataTableToolbar({ children }: { readonly children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 md:border-b md:px-4 md:py-3">
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <DataTableCount />
      </div>
      <DataTableActiveFilters />
    </div>
  );
}

/** Search across the columns marked `searchable`, ignoring case and accents. */
export function DataTableSearch({ label }: { readonly label: string }) {
  const table = useTableContext();
  const id = useId();
  const value = String(table.state.globalFilter ?? "");

  return (
    <div className="relative w-full sm:w-72">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
      />
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(event) => table.setGlobalFilter(event.target.value)}
        placeholder={label}
        className="pl-8"
      />
    </div>
  );
}

/** A facet filter: the column's choices as checkboxes with how many rows each would show under the other filters. */
export function DataTableFacetFilter({ columnId }: { readonly columnId: string }) {
  const t = useTranslations("dataTable");
  const table = useTableContext();
  const column = table.getColumn(columnId);
  const meta = column ? metaOf(column) : undefined;
  if (!column || !meta?.filter) return null;

  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? []);
  const counts = column.getFacetedUniqueValues();
  const toggle = (value: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(value);
    else next.delete(value);
    column.setFilterValue(next.size > 0 ? [...next] : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8">
          <ListFilter aria-hidden />
          {meta.label}
          {selected.size > 0 ? (
            <Badge variant="secondary" className="ml-1">
              <span className="sr-only">{t("selectedCount", { count: selected.size })}</span>
              <span aria-hidden>{selected.size}</span>
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <fieldset className="flex flex-col gap-1">
          <legend className="text-muted-foreground px-2 pb-1 text-xs font-medium">
            {t("filterBy", { label: meta.label })}
          </legend>
          {meta.filter.options.map((option) => {
            const id = `${columnId}-${option.value}`;
            return (
              <div key={option.value} className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5">
                <Checkbox
                  id={id}
                  checked={selected.has(option.value)}
                  onCheckedChange={(checked) => toggle(option.value, checked === true)}
                />
                <Label htmlFor={id} className="flex-1 font-normal">
                  {option.label}
                </Label>
                <span className="text-muted-foreground text-xs tabular-nums">{counts.get(option.value) ?? 0}</span>
              </div>
            );
          })}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

/** How many rows the filters leave, of how many, announced politely when it changes. */
function DataTableCount() {
  const t = useTranslations("dataTable");
  const table = useTableContext();
  const total = table.getPreFilteredRowModel().rows.length;
  const shown = table.getFilteredRowModel().rows.length;
  return (
    <p className="text-muted-foreground ml-auto text-sm tabular-nums" aria-live="polite">
      {t("count", { shown, total })}
    </p>
  );
}

/** Each filter value and the search as a chip that removes itself, and "Limpiar filtros" for all. Nothing when none. */
function DataTableActiveFilters() {
  const t = useTranslations("dataTable");
  const table = useTableContext();
  const search = String(table.state.globalFilter ?? "").trim();

  const chips = table.state.columnFilters.flatMap((filter) => {
    const column = table.getColumn(filter.id);
    const meta = column ? metaOf(column) : undefined;
    const values = Array.isArray(filter.value) ? (filter.value as string[]) : [];
    return values.map((value) => ({
      key: `${filter.id}:${value}`,
      text: t("chip", {
        label: meta?.label ?? filter.id,
        value: meta?.filter?.options.find((option) => option.value === value)?.label ?? value,
      }),
      remove: () => {
        const rest = values.filter((other) => other !== value);
        column?.setFilterValue(rest.length > 0 ? rest : undefined);
      },
    }));
  });
  if (search)
    chips.unshift({ key: "search", text: t("searchChip", { query: search }), remove: () => table.setGlobalFilter("") });
  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={t("activeFilters")}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 gap-1 rounded-full px-2.5"
            onClick={chip.remove}
          >
            {chip.text}
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">{t("remove")}</span>
          </Button>
        </li>
      ))}
      <li>
        <Button type="button" variant="link" size="sm" className="h-7 px-2" onClick={() => clearFilters(table)}>
          {t("clear")}
        </Button>
      </li>
    </ul>
  );
}

function clearFilters(table: ReturnType<typeof useTableContext>) {
  table.resetColumnFilters(true);
  table.setGlobalFilter("");
}

const HEAD = "text-muted-foreground font-medium first:pl-4 last:pr-4";
const SORT_ICON = { asc: ArrowUp, desc: ArrowDown } as const;
const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/** The sortable header: a button that cycles ascending, descending and none, with `aria-sort` on the cell. */
// biome-ignore lint/suspicious/noExplicitAny: a header of any row type; the cell reads only its column.
function HeaderCell({ header }: { readonly header: Header<AppFeatures, any, unknown> }) {
  const t = useTranslations("dataTable");
  const column = header.column;
  const meta = metaOf(column);
  const label = meta?.label ?? column.id;
  const sorted = column.getIsSorted();
  const align = meta?.align === "end" ? "text-right" : undefined;

  if (meta?.card === "actions") {
    return (
      <TableHead scope="col" className={cn(HEAD, align)}>
        <span className="sr-only">{label}</span>
      </TableHead>
    );
  }
  if (!column.getCanSort()) {
    return (
      <TableHead scope="col" className={cn(HEAD, align)}>
        <span className="text-muted-foreground font-medium">{label}</span>
      </TableHead>
    );
  }
  const Icon = sorted ? SORT_ICON[sorted] : ChevronsUpDown;
  return (
    <TableHead scope="col" className={cn(HEAD, align)} aria-sort={sorted ? ARIA_SORT[sorted] : undefined}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "text-muted-foreground hover:text-foreground -ml-2 h-8 px-2 font-medium",
          sorted && "text-foreground",
          meta?.align === "end" && "-mr-2 ml-0",
        )}
        onClick={column.getToggleSortingHandler()}
        aria-description={t(`sortNext.${column.getNextSortingOrder() || "none"}`)}
      >
        {label}
        <Icon aria-hidden className={cn("size-3.5", !sorted && "text-muted-foreground")} />
      </Button>
    </TableHead>
  );
}

/**
 * The rows: a native table from `md` up and a list of cards below it (the same data, laid out by each column's `card`
 * role). When the filters leave nothing, it says so and offers to clear them; an empty collection is the page's own
 * empty state, never this one.
 */
export function DataTableContent({ caption }: { readonly caption: string }) {
  const t = useTranslations("dataTable");
  const table = useTableContext();
  const rows = table.getRowModel().rows;

  if (rows.length === 0) {
    return (
      <div className="bg-card flex flex-col items-start gap-2 rounded-lg border p-6 text-sm md:rounded-none md:border-0 md:bg-transparent">
        <p className="font-medium">{t("noResults.title")}</p>
        <p className="text-muted-foreground">{t("noResults.description")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => clearFilters(table)}>
          {t("clear")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <HeaderCell key={header.id} header={header} />
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "first:pl-4 last:pr-4",
                      metaOf(cell.column)?.align === "end" && "text-right tabular-nums",
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const cells = row.getAllCells();
          const byRole = (role: NonNullable<DataTableColumnMeta["card"]>) =>
            cells.filter((cell) => (metaOf(cell.column)?.card ?? "detail") === role);
          const actions = byRole("actions");
          return (
            <li key={row.id} className="bg-card flex flex-col gap-2 rounded-lg border p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="font-semibold">
                  {byRole("title").map((cell) => (
                    <table.FlexRender key={cell.id} cell={cell} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {byRole("badge").map((cell) => (
                    <table.FlexRender key={cell.id} cell={cell} />
                  ))}
                </div>
              </div>
              <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {byRole("detail").map((cell) => (
                  <div key={cell.id} className="contents">
                    <dt>{metaOf(cell.column)?.label}</dt>
                    <dd className="text-foreground">
                      <table.FlexRender cell={cell} />
                    </dd>
                  </div>
                ))}
              </dl>
              {actions.length > 0 ? (
                <div className="flex flex-wrap justify-end gap-1">
                  {actions.map((cell) => (
                    <table.FlexRender key={cell.id} cell={cell} />
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Pages, only when there is more than one: previous, next and where you are. */
export function DataTablePagination() {
  const t = useTranslations("dataTable");
  const table = useTableContext();
  const pages = table.getPageCount();
  if (pages <= 1) return null;

  return (
    <nav
      aria-label={t("pagination.label")}
      className="flex items-center justify-end gap-2 text-sm md:border-t md:px-4 md:py-3"
    >
      <p className="text-muted-foreground mr-auto tabular-nums" aria-live="polite">
        {t("pagination.page", { page: table.state.pagination.pageIndex + 1, pages })}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => table.previousPage()}
        disabled={!table.getCanPreviousPage()}
      >
        {t("pagination.previous")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => table.nextPage()}
        disabled={!table.getCanNextPage()}
      >
        {t("pagination.next")}
      </Button>
    </nav>
  );
}
