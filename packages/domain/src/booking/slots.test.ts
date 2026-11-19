import { describe, expect, it } from "vitest";

import { type LocalDate, zonedInstant } from "./calendar";
import type { FacilityRules } from "./facility";
import { endTimes, isBookableDay, nextOpenDay, startOptions, startTimes } from "./slots";

const CENTRAL: FacilityRules = {
  timeZone: "America/Argentina/Buenos_Aires",
  opensAt: 8 * 60,
  closesAt: 20 * 60,
  openWeekdays: [1, 2, 3, 4, 5],
};

const day = (text: string) => text as LocalDate;
const at = (date: string, hours: number, minutes = 0) =>
  zonedInstant(day(date), hours * 60 + minutes, CENTRAL.timeZone);

describe("start times (spec 0003 AC-7)", () => {
  it("lists 08:00 to 19:30 every 30 minutes", () => {
    const times = startTimes(CENTRAL);
    expect(times).toHaveLength(24);
    expect(times[0]).toBe("08:00");
    expect(times.at(-1)).toBe("19:30");
  });

  it("disables the starts already passed on today, and none on a later day", () => {
    const now = at("2026-11-09", 10, 15);
    const today = startOptions(day("2026-11-09"), now, CENTRAL);
    expect(today.filter((option) => option.disabled).map((option) => option.time)).toEqual([
      "08:00",
      "08:30",
      "09:00",
      "09:30",
      "10:00",
    ]);
    expect(startOptions(day("2026-11-10"), now, CENTRAL).some((option) => option.disabled)).toBe(false);
  });

  it("disables a start at the exact current time (a start must be after now)", () => {
    const options = startOptions(day("2026-11-09"), at("2026-11-09", 10), CENTRAL);
    expect(options.find((option) => option.time === "10:00")?.disabled).toBe(true);
    expect(options.find((option) => option.time === "10:30")?.disabled).toBe(false);
  });
});

describe("end times", () => {
  it("offers 30 minutes to 4 hours after the start", () => {
    const ends = endTimes("10:00", CENTRAL);
    expect(ends[0]).toBe("10:30");
    expect(ends.at(-1)).toBe("14:00");
    expect(ends).toHaveLength(8);
  });

  it("never goes past 20:00", () => {
    expect(endTimes("18:30", CENTRAL)).toEqual(["19:00", "19:30", "20:00"]);
    expect(endTimes("19:30", CENTRAL)).toEqual(["20:00"]);
  });

  it("offers nothing for a start that is not on the list", () => {
    expect(endTimes("10:15", CENTRAL)).toEqual([]);
    expect(endTimes("20:00", CENTRAL)).toEqual([]);
    expect(endTimes("nope", CENTRAL)).toEqual([]);
  });
});

describe("isBookableDay", () => {
  const now = at("2026-11-09", 9);

  it("allows weekdays from today to 60 days ahead", () => {
    expect(isBookableDay(day("2026-11-09"), now, CENTRAL)).toBe(true);
    expect(isBookableDay(day("2027-01-08"), now, CENTRAL)).toBe(true);
  });

  it("refuses past days, weekends and days beyond the horizon", () => {
    expect(isBookableDay(day("2026-11-06"), now, CENTRAL)).toBe(false);
    expect(isBookableDay(day("2026-11-14"), now, CENTRAL)).toBe(false);
    expect(isBookableDay(day("2026-11-15"), now, CENTRAL)).toBe(false);
    expect(isBookableDay(day("2027-01-11"), now, CENTRAL)).toBe(false);
  });
});

describe("nextOpenDay", () => {
  it("is today on a weekday while a start is still ahead", () => {
    expect(nextOpenDay(at("2026-11-09", 7), CENTRAL)).toBe("2026-11-09");
    expect(nextOpenDay(at("2026-11-09", 19, 29), CENTRAL)).toBe("2026-11-09");
  });

  it("is the next weekday from 19:30 on", () => {
    expect(nextOpenDay(at("2026-11-09", 19, 30), CENTRAL)).toBe("2026-11-10");
  });

  it("skips the weekend", () => {
    expect(nextOpenDay(at("2026-11-13", 20), CENTRAL)).toBe("2026-11-16");
    expect(nextOpenDay(at("2026-11-14", 10), CENTRAL)).toBe("2026-11-16");
    expect(nextOpenDay(at("2026-11-15", 10), CENTRAL)).toBe("2026-11-16");
  });
});

describe("a facility with its own hours and days (spec 0004, AC-9)", () => {
  const EARLY: FacilityRules = { ...CENTRAL, opensAt: 9 * 60, closesAt: 13 * 60, openWeekdays: [2, 6] };

  it("lists starts from its opening to the last one that still fits", () => {
    expect(startTimes(EARLY)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]);
  });

  it("never offers an end after its closing", () => {
    expect(endTimes("12:00", EARLY)).toEqual(["12:30", "13:00"]);
    expect(endTimes("08:00", EARLY)).toEqual([]); // before it opens
  });

  it("opens the calendar only on the days it opens", () => {
    const now = at("2026-11-09", 9); // Monday
    expect(isBookableDay(day("2026-11-10"), now, EARLY)).toBe(true); // Tuesday
    expect(isBookableDay(day("2026-11-14"), now, EARLY)).toBe(true); // Saturday
    expect(isBookableDay(day("2026-11-11"), now, EARLY)).toBe(false); // Wednesday
    expect(nextOpenDay(now, EARLY)).toBe("2026-11-10");
  });
});
