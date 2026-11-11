import { describe, expect, it } from "vitest";

import { type LocalDate, zonedInstant } from "./calendar";
import { lastBookableDay, validateBooking } from "./rules";

const at = (date: string, time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return zonedInstant(date as LocalDate, hours * 60 + minutes);
};

// Monday 2026-11-09, 09:00 in Buenos Aires.
const NOW = at("2026-11-09", "09:00");

const check = (date: string, start: string, end: string, endDate = date) =>
  validateBooking({ startsAt: at(date, start), endsAt: at(endDate, end) }, NOW);

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
    expect(validateBooking(withSeconds, NOW)).toEqual({ ok: false, reason: "not_on_grid" });
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
    expect(lastBookableDay(NOW)).toBe("2027-01-08");
    expect(check("2027-01-08", "19:00", "20:00").ok).toBe(true);
    expect(check("2027-01-11", "10:00", "11:00")).toEqual({ ok: false, reason: "beyond_horizon" });
  });
});
