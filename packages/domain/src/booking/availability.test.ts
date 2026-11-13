import { describe, expect, it } from "vitest";

import { type BusyInterval, busySpans, daySlots, freeStarts, roomNow, windowFit } from "./availability";
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

describe("overlapping blocks (spec 0004: allowed, their union applies)", () => {
  const blocked = (from: [number, number], to: [number, number]): BusyInterval => ({
    startsAt: at(7, ...from),
    endsAt: at(7, ...to),
    kind: "blocked",
    mine: false,
  });
  // 10:00 to 12:00 and 11:00 to 13:00: one closed stretch, 10:00 to 13:00.
  const chained = [blocked([10, 0], [12, 0]), blocked([11, 0], [13, 0])];
  // 14:00 to 18:00 with 15:00 to 16:00 inside it.
  const nested = [blocked([14, 0], [18, 0]), blocked([15, 0], [16, 0])];

  it("marks every slot of the union blocked, and the slots around it free", () => {
    const slots = daySlots(monday, facility, [...chained, ...nested], now);
    const state = (minutes: number) => slots.find((slot) => slot.start === minutes)?.state;
    expect([570, 600, 630, 660, 690, 720, 750, 780].map(state)).toEqual([
      "free",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "free",
    ]);
    expect([810, 840, 900, 960, 1050, 1080].map(state)).toEqual([
      "free",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "free",
    ]);
  });

  it("keeps a block over a booking blocked, whatever the order they come in", () => {
    const booking: BusyInterval = { startsAt: at(7, 10), endsAt: at(7, 11), kind: "booked", mine: true };
    for (const order of [
      [booking, ...chained],
      [...chained, booking],
    ]) {
      expect(daySlots(monday, facility, order, now).find((slot) => slot.start === 600)?.state).toBe("blocked");
    }
  });

  it("says the room is blocked until the whole union ends, not the first block", () => {
    expect(roomNow(facility, chained, at(7, 10, 15))).toEqual({ state: "blocked", until: 780 });
    expect(roomNow(facility, chained, at(7, 12, 30))).toEqual({ state: "blocked", until: 780 });
    // Inside the short block nested in the long one: free again only when the long one ends.
    expect(roomNow(facility, nested, at(7, 15, 30))).toEqual({ state: "blocked", until: 1080 });
    expect(roomNow(facility, chained, at(7, 9, 30))).toEqual({ state: "free", until: 600 });
  });

  it("frees a window only after the union, and lists each block it touches", () => {
    const fit = windowFit(monday, facility, chained, now, 690, 720);
    expect(fit.state).toBe("conflict");
    expect(fit.conflicts.map((span) => [span.start, span.end])).toEqual([
      [600, 720],
      [660, 780],
    ]);
    expect(fit.freeFrom).toBe(780);
    expect(windowFit(monday, facility, nested, now, 1080, 1140)).toMatchObject({ state: "free", conflicts: [] });
  });

  it("offers no start whose booking would touch any of the blocks", () => {
    const starts = freeStarts(monday, facility, [...chained, ...nested], now, 60);
    // 09:00 has passed (the clock reads 09:10) and 09:30 would run into the first block at 10:00.
    expect(starts.filter((start) => start <= 1080)).toEqual([780, 1080]);
  });
});
