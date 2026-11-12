import { describe, expect, it } from "vitest";

import { type BusyInterval, busySpans, daySlots, roomNow, windowFit } from "./availability";
import type { LocalDate } from "./calendar";
import type { FacilityRules } from "./facility";

// Buenos Aires (UTC-3), Monday to Friday 08:00 to 20:00. Monday 2030-01-07.
const facility: FacilityRules = {
  timeZone: "America/Argentina/Buenos_Aires",
  opensAt: 480,
  closesAt: 1200,
  openWeekdays: [1, 2, 3, 4, 5],
};
const monday = "2030-01-07" as LocalDate;
const saturday = "2030-01-12" as LocalDate;
const at = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2030, 0, day, hour + 3, minute));
const busy: BusyInterval[] = [
  { startsAt: at(7, 10), endsAt: at(7, 11), kind: "booked", mine: false },
  { startsAt: at(7, 11), endsAt: at(7, 12), kind: "booked", mine: true },
  { startsAt: at(7, 15), endsAt: at(7, 16), kind: "blocked", mine: false },
];
const now = at(7, 9, 10);

describe("busySpans", () => {
  it("reads busy time as minutes of the local day, clipped to it", () => {
    const overnight: BusyInterval = { startsAt: at(6, 23), endsAt: at(7, 9), kind: "blocked", mine: false };
    expect(busySpans(monday, facility, [overnight, ...busy]).map((span) => [span.start, span.end])).toEqual([
      [0, 540],
      [600, 660],
      [660, 720],
      [900, 960],
    ]);
  });
});

describe("daySlots", () => {
  it("splits opening hours in 30 minutes: blocked first, then mine, then booked, then past", () => {
    const slots = daySlots(monday, facility, busy, now);
    expect(slots).toHaveLength(24);
    const state = (minutes: number) => slots.find((slot) => slot.start === minutes)?.state;
    expect([480, 540, 570, 600, 630, 660, 690, 720, 900, 930].map(state)).toEqual([
      "past",
      "past",
      "free",
      "booked",
      "booked",
      "mine",
      "mine",
      "free",
      "blocked",
      "blocked",
    ]);
  });

  it("has no slots on a closed day", () => {
    expect(daySlots(saturday, facility, [], now)).toEqual([]);
  });
});

describe("windowFit", () => {
  it("finds a free window and the free time around it", () => {
    expect(windowFit(monday, facility, busy, now, 780, 840)).toEqual({
      state: "free",
      conflicts: [],
      freeBefore: { start: 720, end: 780 },
      freeAfter: { start: 840, end: 900 },
      nextBusy: 900,
      freeFrom: null,
    });
  });

  it("names the conflicts and when the room is free again, through back to back bookings", () => {
    const fit = windowFit(monday, facility, busy, now, 630, 750);
    expect(fit.state).toBe("conflict");
    expect(fit.conflicts.map((span) => [span.start, span.end, span.mine])).toEqual([
      [600, 660, false],
      [660, 720, true],
    ]);
    expect(fit.freeFrom).toBe(720);
    // Free before starts at the next slot after now (09:30), never in the past.
    expect(fit.freeBefore).toEqual({ start: 570, end: 600 });
  });

  it("refuses a window that started, falls outside hours, or a closed day", () => {
    expect(windowFit(monday, facility, busy, now, 540, 600).state).toBe("past");
    expect(windowFit(monday, facility, busy, now, 1170, 1230).state).toBe("outside_hours");
    expect(windowFit(saturday, facility, [], now, 600, 660).state).toBe("closed");
  });

  it("has no next busy time when the room stays free until closing", () => {
    const fit = windowFit(monday, facility, busy, now, 1020, 1080);
    expect(fit).toMatchObject({ state: "free", nextBusy: null, freeAfter: { start: 1080, end: 1200 } });
  });
});

describe("roomNow", () => {
  it("is busy until the room frees, blocked until the block ends, free until the next busy time, or closed", () => {
    expect(roomNow(facility, busy, at(7, 10, 15))).toEqual({ state: "busy", until: 720 });
    expect(roomNow(facility, busy, at(7, 15, 20))).toEqual({ state: "blocked", until: 960 });
    expect(roomNow(facility, busy, at(7, 13))).toEqual({ state: "free", until: 900 });
    expect(roomNow(facility, busy, at(7, 21))).toEqual({ state: "closed", until: null });
    expect(roomNow(facility, [], at(12, 10))).toEqual({ state: "closed", until: null });
  });
});
