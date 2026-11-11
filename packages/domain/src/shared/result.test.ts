import { describe, expect, it } from "vitest";

import { fail, ok, REASONS } from "./result";

describe("result", () => {
  it("wraps a value as a success", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("carries only the reason of a failure, never a text", () => {
    expect(fail("conflict")).toEqual({ ok: false, reason: "conflict" });
  });

  it("carries the bookings in the way only when given", () => {
    const details = { total: 0, bookings: [] };
    expect(fail("has_future_bookings", details)).toEqual({ ok: false, reason: "has_future_bookings", details });
  });

  it("lists each reason once", () => {
    expect(new Set(REASONS).size).toBe(REASONS.length);
  });
});
