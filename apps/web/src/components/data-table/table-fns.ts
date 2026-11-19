/** The app's own filter and sort functions for TanStack Table (spec 0005), pure so they are tested alone. */

/** Lowercase without accents, so "Cordoba" finds "Córdoba". */
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The search box: every word typed must appear in the column, ignoring case and accents. */
export function filterFn_search(
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  query: unknown,
): boolean {
  const value = fold(String(row.getValue(columnId) ?? ""));
  return fold(String(query ?? ""))
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => value.includes(word));
}
filterFn_search.autoRemove = (query: unknown) => !String(query ?? "").trim();

/** Instants as RFC 3339 with an offset sort by the moment they name, not by their text. */
export function sortFn_instant(
  a: { getValue: (columnId: string) => unknown },
  b: { getValue: (columnId: string) => unknown },
  columnId: string,
): number {
  return Date.parse(String(a.getValue(columnId))) - Date.parse(String(b.getValue(columnId)));
}

/**
 * A facet filter: the row's single value is one of the values chosen. (`arrIncludesSome` is the other way around: it
 * expects the row's value to be an array.)
 */
export function filterFn_oneOf(
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  chosen: unknown,
): boolean {
  return Array.isArray(chosen) && chosen.includes(row.getValue(columnId));
}
filterFn_oneOf.autoRemove = (chosen: unknown) => !Array.isArray(chosen) || chosen.length === 0;
