import type { FacilityMonthRoom } from "@espacios/application";
import {
  addDays,
  BOOKING_DURATIONS,
  type BusySpan,
  busySpans,
  daySlots,
  freeStarts,
  isBookableDay,
  type LocalDate,
  localMinutesOf,
  todayAt,
} from "@espacios/domain";

import type { MonthData } from "./month";
import { fitsSize, type RoomSize, timeOf } from "./search";

/**
 * The rooms matrix of `/salas` (spec 0009): one sede's day with a column per room. FullCalendar's free time grid only
 * puts days in columns, so the matrix is a time grid of N days where day `i` (counted from a fixed Monday) stands for
 * room `i`, read in UTC so a column's clock is the sede's clock on the chosen day. Everything that crosses that line
 * (events in, selections out) goes through `columnTime` and `cellOf`, nowhere else.
 */

const BASE = "2001-01-01" as LocalDate;
const DAY_MS = 86_400_000;
const BASE_MS = Date.parse(`${BASE}T00:00:00Z`);

/** The calendar date column `index` stands for. */
export const columnDate = (index: number) => addDays(BASE, index);

/** The calendar instant for local `minutes` in column `index`, as an ISO string in UTC. */
export const columnTime = (index: number, minutes: number) => `${columnDate(index)}T${timeOf(minutes)}:00Z`;

/** The column and the local minutes a calendar instant stands for. */
export function cellOf(instant: Date): { readonly column: number; readonly minutes: number } {
  const ms = instant.getTime() - BASE_MS;
  const column = Math.floor(ms / DAY_MS);
  return { column, minutes: Math.round((ms - column * DAY_MS) / 60_000) };
}

/** Rooms with room for `people` in `size`, smallest first, then by name: the columns, left to right. */
export function matrixRooms(month: MonthData, people: number, size: RoomSize = "todas"): FacilityMonthRoom[] {
  return month.rooms
    .filter((room) => room.capacity >= people && fitsSize(room.capacity, size))
    .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
}

export type MatrixBusy = { readonly column: number; readonly span: BusySpan };

/** The busy time of every column on `day`, clipped to the sede's hours. */
export function matrixBusy(month: MonthData, rooms: readonly FacilityMonthRoom[], day: LocalDate): MatrixBusy[] {
  const { opensAt, closesAt } = month.facility;
  return rooms.flatMap((room, column) =>
    busySpans(day, month.facility, month.busyByRoom.get(room.id) ?? [])
      .map((span) => ({ ...span, start: Math.max(span.start, opensAt), end: Math.min(span.end, closesAt) }))
      .filter((span) => span.start < span.end)
      .map((span) => ({ column, span })),
  );
}

/**
 * Up to when `day` is over for booking, in local minutes: the sede's closing for a past day or one that does not take
 * bookings (closed, beyond the horizon), now (on the 30 minute grid) for today, opening for a later day.
 */
export function bookableFrom(month: MonthData, day: LocalDate, now: Date): number {
  const { opensAt, closesAt, timeZone } = month.facility;
  if (!isBookableDay(day, now, month.facility)) return closesAt;
  if (day > todayAt(now, timeZone)) return opensAt;
  return Math.min(closesAt, Math.max(opensAt, Math.ceil(localMinutesOf(now, timeZone) / 30) * 30));
}

/** Free 30 minute slots of `rooms` (the columns the filters left) on each day of the week starting `monday`. */
export function freeSlotsByDay(
  month: MonthData,
  rooms: readonly FacilityMonthRoom[],
  monday: LocalDate,
  now: Date,
): Map<LocalDate, number> {
  const counts = new Map<LocalDate, number>();
  for (let index = 0; index < 7; index += 1) {
    const day = addDays(monday, index);
    const bookable = isBookableDay(day, now, month.facility);
    counts.set(
      day,
      bookable
        ? rooms.reduce(
            (sum, room) =>
              sum +
              daySlots(day, month.facility, month.busyByRoom.get(room.id) ?? [], now).filter(
                (slot) => slot.state === "free",
              ).length,
            0,
          )
        : 0,
    );
  }
  return counts;
}

/** The starts a room offers on `day` for the shortest booking, and the lengths that fit from `start`. */
export function roomOptions(
  month: MonthData,
  roomId: string,
  day: LocalDate,
  now: Date,
  start: number,
): { readonly starts: readonly number[]; readonly durations: readonly number[] } {
  const busy = month.busyByRoom.get(roomId) ?? [];
  return {
    starts: freeStarts(day, month.facility, busy, now, BOOKING_DURATIONS[0]),
    durations: BOOKING_DURATIONS.filter((minutes) =>
      freeStarts(day, month.facility, busy, now, minutes).includes(start),
    ),
  };
}

/** Whether the 30 minute slot of `roomId` that starts at local `minutes` on `day` can be booked now. */
export function isFreeSlot(month: MonthData, roomId: string, day: LocalDate, now: Date, minutes: number): boolean {
  if (minutes < bookableFrom(month, day, now)) return false;
  const slot = daySlots(day, month.facility, month.busyByRoom.get(roomId) ?? [], now).find(
    (item) => item.start === minutes,
  );
  return slot?.state === "free";
}

/**
 * Where a time grid of `day` should open: today, half an hour before now (the current time line); another day, half an
 * hour before the first slot any of `roomIds` can still take, or the opening hour when none can.
 */
export function scrollTimeFor(month: MonthData, roomIds: readonly string[], day: LocalDate, now: Date): string {
  const { opensAt, closesAt, timeZone } = month.facility;
  // On the 30 minute grid, so a clock that moves every minute changes it only every half hour.
  const at = (minutes: number) =>
    `${timeOf(Math.min(closesAt, Math.max(opensAt, Math.floor((minutes - 30) / 30) * 30)))}:00`;
  if (day === todayAt(now, timeZone)) return at(localMinutesOf(now, timeZone));
  const from = bookableFrom(month, day, now);
  const firsts = roomIds.flatMap((roomId) => {
    const slot = daySlots(day, month.facility, month.busyByRoom.get(roomId) ?? [], now).find(
      (item) => item.start >= from && item.state === "free",
    );
    return slot ? [slot.start] : [];
  });
  return at(firsts.length > 0 ? Math.min(...firsts) : opensAt + 30);
}

/** How many 30 minute slots `roomId` can still take on `day`. */
export function freeSlotCount(month: MonthData, roomId: string, day: LocalDate, now: Date): number {
  const from = bookableFrom(month, day, now);
  return daySlots(day, month.facility, month.busyByRoom.get(roomId) ?? [], now).filter(
    (slot) => slot.start >= from && slot.state === "free",
  ).length;
}
