import { describe, expect, it } from "vitest";

import {
  addDays,
  facilityOffsetMinutes,
  formatTime,
  isTimeZone,
  isWholeMinute,
  type LocalDate,
  localDateOf,
  localMinutesOf,
  parseLocalDate,
  parseTime,
  toFacilityIso,
  weekdayOf,
  zonedInstant,
} from "./calendar";

const BA = "America/Argentina/Buenos_Aires";

const day = (text: string) => text as LocalDate;

describe("facility time zone (spec 0001 P-7)", () => {
  it("assumes Buenos Aires has no daylight saving time: the offset is -03:00 all year", () => {
    for (const year of [2026, 2027, 2028]) {
      for (let month = 0; month < 12; month += 1) {
        expect(facilityOffsetMinutes(new Date(Date.UTC(year, month, 15, 12)), BA)).toBe(-180);
      }
    }
  });

  it("builds the instant a local wall clock shows", () => {
    expect(zonedInstant(day("2026-11-12"), 10 * 60, BA).toISOString()).toBe("2026-11-12T13:00:00.000Z");
    expect(zonedInstant(day("2026-11-12"), 22 * 60 + 30, BA).toISOString()).toBe("2026-11-13T01:30:00.000Z");
  });

  it("reads the local day and minutes of an instant, across UTC midnight", () => {
    const lateEvening = new Date("2026-11-13T01:30:00Z");
    expect(localDateOf(lateEvening, BA)).toBe("2026-11-12");
    expect(localMinutesOf(lateEvening, BA)).toBe(22 * 60 + 30);
  });

  it("writes RFC 3339 with the -03:00 offset", () => {
    expect(toFacilityIso(new Date("2026-11-12T13:00:00Z"), BA)).toBe("2026-11-12T10:00:00-03:00");
    expect(toFacilityIso(new Date("2026-11-13T02:05:09Z"), BA)).toBe("2026-11-12T23:05:09-03:00");
  });

  it("tells a whole minute from one with seconds or milliseconds", () => {
    expect(isWholeMinute(new Date("2026-11-12T13:00:00.000Z"), BA)).toBe(true);
    expect(isWholeMinute(new Date("2026-11-12T13:00:01.000Z"), BA)).toBe(false);
    expect(isWholeMinute(new Date("2026-11-12T13:00:00.001Z"), BA)).toBe(false);
  });
});

describe("local dates", () => {
  it("accepts a real day and refuses anything else", () => {
    expect(parseLocalDate("2028-02-29")).toBe("2028-02-29");
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("2026-13-01")).toBeNull();
    expect(parseLocalDate("12/11/2026")).toBeNull();
    expect(parseLocalDate("")).toBeNull();
  });

  it("adds days across months and years, forward and back", () => {
    expect(addDays(day("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(day("2026-11-12"), 60)).toBe("2027-01-11");
    expect(addDays(day("2026-03-01"), -1)).toBe("2026-02-28");
  });

  it("knows the weekday", () => {
    expect(weekdayOf(day("2026-11-09"))).toBe(1);
    expect(weekdayOf(day("2026-11-15"))).toBe(0);
  });
});

describe("times of day", () => {
  it("parses HH:mm in 24 hours", () => {
    expect(parseTime("08:00")).toBe(480);
    expect(parseTime("19:30")).toBe(1170);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("8:00")).toBeNull();
    expect(parseTime("10:60")).toBeNull();
  });

  it("formats minutes as HH:mm", () => {
    expect(formatTime(480)).toBe("08:00");
    expect(formatTime(1200)).toBe("20:00");
    expect(formatTime(-30)).toBe("23:30");
  });
});

describe("a facility in another zone (spec 0004)", () => {
  const TOKYO = "Asia/Tokyo";

  it("reads the same instant as a different day and clock", () => {
    const instant = new Date("2026-11-12T20:30:00Z"); // 17:30 in Buenos Aires, 05:30 the next day in Tokyo
    expect(localDateOf(instant, BA)).toBe("2026-11-12");
    expect(localDateOf(instant, TOKYO)).toBe("2026-11-13");
    expect(localMinutesOf(instant, TOKYO)).toBe(5 * 60 + 30);
    expect(toFacilityIso(instant, TOKYO)).toBe("2026-11-13T05:30:00+09:00");
  });

  it("builds the instant of a wall clock in that zone", () => {
    expect(zonedInstant(day("2026-11-12"), 10 * 60, TOKYO).toISOString()).toBe("2026-11-12T01:00:00.000Z");
  });

  it("knows which zones exist", () => {
    expect(isTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
