import { describe, expect, it } from "vitest";

import { filterFn_oneOf, filterFn_search, sortFn_instant } from "./table-fns";

const row = (value: unknown) => ({ getValue: () => value });

describe("data table functions (spec 0005)", () => {
  it("finds every word typed, ignoring case and accents", () => {
    expect(filterFn_search(row("Sede Córdoba Centro"), "name", "cordoba  CENTRO")).toBe(true);
    expect(filterFn_search(row("Sede Córdoba Centro"), "name", "cordoba norte")).toBe(false);
    expect(filterFn_search(row(null), "name", "x")).toBe(false);
  });

  it("drops an empty or blank search from the filters", () => {
    expect(filterFn_search.autoRemove("   ")).toBe(true);
    expect(filterFn_search.autoRemove("sol")).toBe(false);
  });

  it("sorts instants by the moment they name, whatever their offset", () => {
    // 10:00 at -03:00 is 13:00Z, later than 12:00Z written at +00:00.
    expect(sortFn_instant(row("2030-01-07T10:00:00-03:00"), row("2030-01-07T12:00:00+00:00"), "at")).toBeGreaterThan(0);
  });
});

describe("filterFn_oneOf", () => {
  it("keeps a row whose value is one of the chosen ones, and drops an empty choice", () => {
    expect(filterFn_oneOf(row("active"), "status", ["active"])).toBe(true);
    expect(filterFn_oneOf(row("inactive"), "status", ["active"])).toBe(false);
    expect(filterFn_oneOf.autoRemove([])).toBe(true);
  });
});
