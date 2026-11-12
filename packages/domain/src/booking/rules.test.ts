import { describe, expect, it } from "vitest";

import { type LocalDate, zonedInstant } from "./calendar";
import type { FacilityRules } from "./facility";
import { lastBookableDay, validateBooking } from "./rules";

const CENTRAL: FacilityRules = {
  timeZone: "America/Argentina/Buenos_Aires",
  opensAt: 8 * 60,
  closesAt: 20 * 60,
  openWeekdays: [1, 2, 3, 4, 5],
};

const at = (date: string, time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return zonedInstant(date as LocalDate, hours * 60 + minutes, CENTRAL.timeZone);
};

// Monday 2026-11-09, 09:00 in Buenos Aires.
const NOW = at("2026-11-09", "09:00");

const check = (date: string, start: string, end: string, endDate = date, facility: FacilityRules = CENTRAL) =>
  validateBooking({ startsAt: at(date, start), endsAt: at(endDate, end) }, NOW, facility);

describe("validateBooking (spec 0001 booking rules, P-7)", () => {
  it("accepts a booking that follows every rule and returns its period", () => {
    const result = check("2026-11-10", "10:00", "11:30");
    expect(result).toEqual({
      ok: true,
      value: { startsAt: at("2026-11-10", "10:00"), endsAt: at("2026-11-10", "11:30") },
    });
  });

  it("accepts the edges: opening to four hours later, and up to closing", () => {
    expect(check("2026-11-10", "08:00", "12:00").ok).toBe(true);
    expect(check("2026-11-10", "19:30", "20:00").ok).toBe(true);
  });

  it("refuses an end before or at the start (invalid_range)", () => {
    expect(check("2026-11-10", "11:00", "10:00")).toEqual({ ok: false, reason: "invalid_range" });
    expect(check("2026-11-10", "10:00", "10:00")).toEqual({ ok: false, reason: "invalid_range" });
  });

  it("refuses a booking that ends on another day (invalid_range)", () => {
    expect(check("2026-11-10", "19:30", "08:00", "2026-11-11")).toEqual({ ok: false, reason: "invalid_range" });
  });

  it("refuses less than 30 minutes (too_short), before looking at the marks", () => {
    expect(check("2026-11-10", "10:00", "10:15")).toEqual({ ok: false, reason: "too_short" });
  });

  it("refuses more than 4 hours (too_long)", () => {
    expect(check("2026-11-10", "08:00", "12:30")).toEqual({ ok: false, reason: "too_long" });
  });

  it("refuses times off the 30 minute marks (not_on_grid)", () => {
    expect(check("2026-11-10", "10:15", "11:15")).toEqual({ ok: false, reason: "not_on_grid" });
    expect(check("2026-11-10", "10:00", "10:45")).toEqual({ ok: false, reason: "not_on_grid" });
    const withSeconds = {
      startsAt: new Date(at("2026-11-10", "10:00").getTime() + 1000),
      endsAt: at("2026-11-10", "11:00"),
    };
    expect(validateBooking(withSeconds, NOW, CENTRAL)).toEqual({ ok: false, reason: "not_on_grid" });
  });

  it("refuses times before opening or after closing (outside_hours)", () => {
    expect(check("2026-11-10", "07:30", "09:00")).toEqual({ ok: false, reason: "outside_hours" });
    expect(check("2026-11-10", "19:00", "20:30")).toEqual({ ok: false, reason: "outside_hours" });
  });

  it("refuses Saturdays and Sundays (outside_hours)", () => {
    expect(check("2026-11-14", "10:00", "11:00")).toEqual({ ok: false, reason: "outside_hours" });
    expect(check("2026-11-15", "10:00", "11:00")).toEqual({ ok: false, reason: "outside_hours" });
  });

  it("refuses a start that is not after now (past_date)", () => {
    expect(check("2026-11-06", "10:00", "11:00")).toEqual({ ok: false, reason: "past_date" });
    expect(check("2026-11-09", "08:30", "09:30")).toEqual({ ok: false, reason: "past_date" });
    expect(check("2026-11-09", "09:00", "10:00")).toEqual({ ok: false, reason: "past_date" });
    expect(check("2026-11-09", "09:30", "10:30").ok).toBe(true);
  });

  it("allows a start on the 60th day and refuses the 61st (beyond_horizon)", () => {
    expect(lastBookableDay(NOW, CENTRAL.timeZone)).toBe("2027-01-08");
    expect(check("2027-01-08", "19:00", "20:00").ok).toBe(true);
    expect(check("2027-01-11", "10:00", "11:00")).toEqual({ ok: false, reason: "beyond_horizon" });
  });
});

describe("validateBooking reads the hours, days and zone of the facility (spec 0004, AC-9)", () => {
  // Monday 2026-11-16. A facility that opens 10:00 to 16:00 on Tuesday and Wednesday only.
  const SHORT: FacilityRules = { ...CENTRAL, opensAt: 10 * 60, closesAt: 16 * 60, openWeekdays: [2, 3] };

  it("refuses what falls before the facility opens or after it closes", () => {
    expect(check("2026-11-17", "09:30", "11:00", "2026-11-17", SHORT)).toEqual({ ok: false, reason: "outside_hours" });
    expect(check("2026-11-17", "15:00", "16:30", "2026-11-17", SHORT)).toEqual({ ok: false, reason: "outside_hours" });
    expect(check("2026-11-17", "10:00", "16:00", "2026-11-17", SHORT).ok).toBe(false); // 6 hours is too long
    expect(check("2026-11-17", "10:00", "12:00", "2026-11-17", SHORT).ok).toBe(true);
  });

  it("refuses a day the facility is closed even if another facility is open then", () => {
    expect(check("2026-11-16", "10:00", "11:00", "2026-11-16", SHORT)).toEqual({ ok: false, reason: "outside_hours" });
    expect(check("2026-11-16", "10:00", "11:00").ok).toBe(true);
  });

  it("reads the clock in the facility's own zone", () => {
    // 10:00 to 11:00 in Tokyo on Tuesday 2026-11-17 is 01:00Z to 02:00Z, Monday evening 22:00 in Buenos Aires.
    const tokyo: FacilityRules = { ...CENTRAL, timeZone: "Asia/Tokyo" };
    const period = { startsAt: new Date("2026-11-17T01:00:00Z"), endsAt: new Date("2026-11-17T02:00:00Z") };
    expect(validateBooking(period, NOW, tokyo).ok).toBe(true);
    expect(validateBooking(period, NOW, CENTRAL)).toEqual({ ok: false, reason: "outside_hours" });
  });
});
