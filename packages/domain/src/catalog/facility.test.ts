import { describe, expect, it } from "vitest";

import { validateFacilityRules } from "./facility";

const valid = {
  timeZone: "America/Argentina/Buenos_Aires",
  opensAt: 480,
  closesAt: 1200,
  openWeekdays: [1, 2, 3, 4, 5],
};

describe("validateFacilityRules (spec 0004, AC-2)", () => {
  it("accepts a facility with a real zone, hours on the marks and open days", () => {
    expect(validateFacilityRules(valid)).toEqual({ ok: true, value: valid });
    expect(validateFacilityRules({ ...valid, opensAt: 0, closesAt: 1440, openWeekdays: [0] }).ok).toBe(true);
  });

  it.each([
    ["an unknown zone", { timeZone: "Mars/Olympus" }],
    ["an opening off the marks", { opensAt: 485 }],
    ["a closing after the day ends", { closesAt: 1470 }],
    ["a negative opening", { opensAt: -30 }],
    ["an opening that is not before the closing", { opensAt: 1200, closesAt: 1200 }],
    ["no open weekday", { openWeekdays: [] }],
    ["a weekday out of range", { openWeekdays: [7] }],
    ["a repeated weekday", { openWeekdays: [1, 1] }],
    ["a fractional weekday", { openWeekdays: [1.5] }],
  ])("refuses %s with invalid_input", (_case, change) => {
    expect(validateFacilityRules({ ...valid, ...change })).toEqual({ ok: false, reason: "invalid_input" });
  });
});
