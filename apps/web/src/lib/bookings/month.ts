import type { FacilityMonth, FacilityMonthRoom } from "@espacios/application";
import {
  addDays,
  type BusyInterval,
  type DaySlot,
  daySlots,
  freeStarts,
  isBookableDay,
  type LocalDate,
  type WindowFit,
  windowFit,
} from "@espacios/domain";

/**
 * The booking search read in the browser from one `FacilityMonth` (spec 0008): which days and starts have room, and
 * how every room reads on the chosen day. Plain derivations over the domain's functions, so the rules stay in one
 * place and a filter or a choice never asks the server again.
 */

export type MonthData = FacilityMonth & {
  /** Each room's busy time, read once per month. */
  readonly busyByRoom: ReadonlyMap<string, readonly BusyInterval[]>;
};

export function indexMonth(month: FacilityMonth): MonthData {
  const busyByRoom = new Map<string, BusyInterval[]>();
  for (const interval of month.busy)
    busyByRoom.set(interval.roomId, [...(busyByRoom.get(interval.roomId) ?? []), interval]);
  return { ...month, busyByRoom };
}

/** Rooms with room for `people`, smallest first, then by name: the first free one is the one to recommend. */
function roomsFor(month: MonthData, people: number): FacilityMonthRoom[] {
  return month.rooms
    .filter((room) => room.capacity >= people)
    .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
}

export type DayStart = { readonly start: number; readonly roomIds: readonly string[] };

/**
 * Each day of the month data with the starts where some room for `people` is free for `minutes`. A day before today or
 * past the booking horizon has none.
 */
export function monthStarts(
  month: MonthData,
  minutes: number,
  people: number,
  now: Date,
): ReadonlyMap<LocalDate, readonly DayStart[]> {
  const rooms = roomsFor(month, people);
  const days = new Map<LocalDate, DayStart[]>();
  for (let date = month.from; date <= month.to; date = addDays(date, 1)) {
    const byStart = new Map<number, string[]>();
    if (!isBookableDay(date, now, month.facility)) {
      days.set(date, []);
      continue;
    }
    for (const room of rooms) {
      for (const start of freeStarts(date, month.facility, month.busyByRoom.get(room.id) ?? [], now, minutes)) {
        byStart.set(start, [...(byStart.get(start) ?? []), room.id]);
      }
    }
    days.set(
      date,
      [...byStart].sort(([a], [b]) => a - b).map(([start, roomIds]) => ({ start, roomIds })),
    );
  }
  return days;
}

export type RoomOnDay = {
  readonly room: FacilityMonthRoom;
  readonly slots: readonly DaySlot[];
  /** How the chosen window fits, or `null` before a start is chosen. */
  readonly fit: WindowFit | null;
};

/** Every room for `people` on `date`: its slots and, when a window is chosen, its fit for it. */
export function roomsOnDay(
  month: MonthData,
  date: LocalDate,
  people: number,
  now: Date,
  window: { readonly start: number; readonly end: number } | null,
): RoomOnDay[] {
  return roomsFor(month, people).map((room) => {
    const busy = month.busyByRoom.get(room.id) ?? [];
    return {
      room,
      slots: daySlots(date, month.facility, busy, now),
      fit: window ? windowFit(date, month.facility, busy, now, window.start, window.end) : null,
    };
  });
}
