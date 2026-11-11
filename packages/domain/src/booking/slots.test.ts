import { describe, expect, it } from "vitest";

import { type LocalDate, zonedInstant } from "./calendar";
import { endTimes, isBookableDay, nextOpenDay, START_TIMES, startOptions } from "./slots";

const day = (text: string) => text as LocalDate;
const at = (date: string, hours: number, minutes = 0) => zonedInstant(day(date), hours * 60 + minutes);

describe("start times (spec 0003 AC-7)", () => {
  it("lists 08:00 to 19:30 every 30 minutes", () => {
    expect(START_TIMES).toHaveLength(24);
    expect(START_TIMES[0]).toBe("08:00");
    expect(START_TIMES.at(-1)).toBe("19:30");
  });

  it("disables the starts already passed on today, and none on a later day", () => {
    const now = at("2026-11-09", 10, 15);
    const today = startOptions(day("2026-11-09"), now);
    expect(today.filter((option) => option.disabled).map((option) => option.time)).toEqual([
      "08:00",
      "08:30",
      "09:00",
      "09:30",
      "10:00",
    ]);
    expect(startOptions(day("2026-11-10"), now).some((option) => option.disabled)).toBe(false);
  });

  it("disables a start at the exact current time (a start must be after now)", () => {
    const options = startOptions(day("2026-11-09"), at("2026-11-09", 10));
    expect(options.find((option) => option.time === "10:00")?.disabled).toBe(true);
    expect(options.find((option) => option.time === "10:30")?.disabled).toBe(false);
  });
});

describe("end times", () => {
  it("offers 30 minutes to 4 hours after the start", () => {
    const ends = endTimes("10:00");
    expect(ends[0]).toBe("10:30");
    expect(ends.at(-1)).toBe("14:00");
    expect(ends).toHaveLength(8);
  });

  it("never goes past 20:00", () => {
    expect(endTimes("18:30")).toEqual(["19:00", "19:30", "20:00"]);
    expect(endTimes("19:30")).toEqual(["20:00"]);
  });

  it("offers nothing for a start that is not on the list", () => {
    expect(endTimes("10:15")).toEqual([]);
    expect(endTimes("20:00")).toEqual([]);
    expect(endTimes("nope")).toEqual([]);
  });
});

describe("isBookableDay", () => {
  const now = at("2026-11-09", 9);

  it("allows weekdays from today to 60 days ahead", () => {
    expect(isBookableDay(day("2026-11-09"), now)).toBe(true);
    expect(isBookableDay(day("2027-01-08"), now)).toBe(true);
  });

  it("refuses past days, weekends and days beyond the horizon", () => {
    expect(isBookableDay(day("2026-11-06"), now)).toBe(false);
    expect(isBookableDay(day("2026-11-14"), now)).toBe(false);
    expect(isBookableDay(day("2026-11-15"), now)).toBe(false);
    expect(isBookableDay(day("2027-01-11"), now)).toBe(false);
  });
});

describe("nextOpenDay", () => {
  it("is today on a weekday while a start is still ahead", () => {
    expect(nextOpenDay(at("2026-11-09", 7))).toBe("2026-11-09");
    expect(nextOpenDay(at("2026-11-09", 19, 29))).toBe("2026-11-09");
  });

  it("is the next weekday from 19:30 on", () => {
    expect(nextOpenDay(at("2026-11-09", 19, 30))).toBe("2026-11-10");
  });

  it("skips the weekend", () => {
    expect(nextOpenDay(at("2026-11-13", 20))).toBe("2026-11-16");
    expect(nextOpenDay(at("2026-11-14", 10))).toBe("2026-11-16");
    expect(nextOpenDay(at("2026-11-15", 10))).toBe("2026-11-16");
  });
});
