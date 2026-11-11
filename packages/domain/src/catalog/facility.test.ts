import { describe, expect, it } from "vitest";

import { changesBookingRules, fitsFacilityRules, validateFacilityRules } from "./facility";

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

describe("changesBookingRules and fitsFacilityRules (spec 0004, AC-6)", () => {
  const day = (hour: number, minute = 0) => new Date(Date.UTC(2030, 0, 7, hour + 3, minute)); // Monday, UTC-3

  it("sees a change in zone, hours or weekdays, and ignores the order of the weekdays", () => {
    expect(changesBookingRules(valid, { ...valid })).toBe(false);
    expect(changesBookingRules(valid, { ...valid, openWeekdays: [5, 4, 3, 2, 1] })).toBe(false);
    expect(changesBookingRules(valid, { ...valid, closesAt: 1140 })).toBe(true);
    expect(changesBookingRules(valid, { ...valid, opensAt: 540 })).toBe(true);
    expect(changesBookingRules(valid, { ...valid, openWeekdays: [1, 2, 3] })).toBe(true);
    expect(changesBookingRules(valid, { ...valid, timeZone: "UTC" })).toBe(true);
  });

  it("fits a booking inside the hours of an open day and refuses the others", () => {
    expect(fitsFacilityRules({ startsAt: day(10), endsAt: day(11) }, valid)).toBe(true);
    expect(fitsFacilityRules({ startsAt: day(19), endsAt: day(20) }, valid)).toBe(true);
    expect(fitsFacilityRules({ startsAt: day(19, 30), endsAt: day(20, 30) }, valid)).toBe(false);
    expect(fitsFacilityRules({ startsAt: day(7, 30), endsAt: day(8, 30) }, valid)).toBe(false);
    expect(fitsFacilityRules({ startsAt: day(10), endsAt: day(11) }, { ...valid, openWeekdays: [2] })).toBe(false);
    // 19:00 in Buenos Aires is 22:00 UTC, after a UTC facility closes.
    expect(fitsFacilityRules({ startsAt: day(19), endsAt: day(20) }, { ...valid, timeZone: "UTC" })).toBe(false);
  });
});
