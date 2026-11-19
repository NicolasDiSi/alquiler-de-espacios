import { addDays, type LocalDate, localMinutesOf, zonedInstant } from "./calendar";
import type { FacilityRules } from "./facility";
import { BOOKING_RULES, isOpenWeekday, todayAt } from "./rules";

/**
 * How a room's day reads to a company (spec 0008): busy time comes in as instants (from `rooms_busy_intervals`) and
 * goes out as minutes of the room's local day, in its sede's zone and hours. Nothing here says who holds a slot:
 * `mine` is the only thing a company learns about a booked interval.
 */

export const BUSY_KINDS = ["booked", "blocked"] as const;
export type BusyKind = (typeof BUSY_KINDS)[number];

/** A confirmed booking or an unreleased block. `mine` is a booking of the caller's own company. */
export type BusyInterval = {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly kind: BusyKind;
  readonly mine: boolean;
};

/** Busy time as minutes from local midnight, `[start, end)`, clipped to the day. */
export type BusySpan = {
  readonly start: number;
  readonly end: number;
  readonly kind: BusyKind;
  readonly mine: boolean;
};

/** A stretch of the day, minutes from local midnight, `[start, end)`. */
export type Span = { readonly start: number; readonly end: number };

export const SLOT_STATES = ["free", "booked", "mine", "blocked", "past"] as const;
export type SlotState = (typeof SLOT_STATES)[number];
export type DaySlot = Span & { readonly state: SlotState };

const DAY_MINUTES = 24 * 60;
const { slotMinutes } = BOOKING_RULES;

/** The busy time of `day` as local minutes, earliest first. */
export function busySpans(day: LocalDate, facility: FacilityRules, busy: readonly BusyInterval[]): BusySpan[] {
  const dayStart = zonedInstant(day, 0, facility.timeZone).getTime();
  const dayEnd = zonedInstant(addDays(day, 1), 0, facility.timeZone).getTime();
  return busy
    .filter((interval) => interval.startsAt.getTime() < dayEnd && interval.endsAt.getTime() > dayStart)
    .map((interval) => ({
      start: interval.startsAt.getTime() <= dayStart ? 0 : localMinutesOf(interval.startsAt, facility.timeZone),
      end: interval.endsAt.getTime() >= dayEnd ? DAY_MINUTES : localMinutesOf(interval.endsAt, facility.timeZone),
      kind: interval.kind,
      mine: interval.mine,
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

const overlaps = (span: Span, start: number, end: number) => span.start < end && span.end > start;

/** Minutes of `now` on `day` in the sede's zone: before the day is -1, after it is a full day. */
function nowMinutes(day: LocalDate, facility: FacilityRules, now: Date): number {
  const today = todayAt(now, facility.timeZone);
  if (day < today) return DAY_MINUTES;
  if (day > today) return -1;
  return localMinutesOf(now, facility.timeZone);
}

/**
 * The day in 30 minute slots over the sede's opening hours. A blocked slot reads `blocked` first, then the company's
 * own booking (`mine`), then another's (`booked`); a free slot that already started is `past`. A closed day has none.
 */
export function daySlots(day: LocalDate, facility: FacilityRules, busy: readonly BusyInterval[], now: Date): DaySlot[] {
  if (!isOpenWeekday(day, facility)) return [];
  const spans = busySpans(day, facility, busy);
  const current = nowMinutes(day, facility, now);
  const slots: DaySlot[] = [];
  for (let start = facility.opensAt; start < facility.closesAt; start += slotMinutes) {
    const end = start + slotMinutes;
    const here = spans.filter((span) => overlaps(span, start, end));
    let state: SlotState = "free";
    if (here.some((span) => span.kind === "blocked")) state = "blocked";
    else if (here.some((span) => span.mine)) state = "mine";
    else if (here.length > 0) state = "booked";
    else if (start < current) state = "past";
    slots.push({ start, end, state });
  }
  return slots;
}

/** Where busy time that covers `from` ends, following back to back intervals; `from` itself when nothing covers it. */
function freeAgainFrom(spans: readonly BusySpan[], from: number): number {
  let at = from;
  for (const span of spans) if (span.start <= at && span.end > at) at = span.end;
  return at;
}

export const WINDOW_STATES = ["free", "conflict", "closed", "outside_hours", "past"] as const;
export type WindowState = (typeof WINDOW_STATES)[number];

export type WindowFit = {
  readonly state: WindowState;
  /** Busy time inside the window. */
  readonly conflicts: readonly BusySpan[];
  /** The free stretch right before the window and right after it, within opening hours and not in the past. */
  readonly freeBefore: Span | null;
  readonly freeAfter: Span | null;
  /** When the next busy time after the window starts, `null` when the room stays free until closing. */
  readonly nextBusy: number | null;
  /** On a conflict: when the room is free again after it, `null` when it is busy until closing. */
  readonly freeFrom: number | null;
};

/** Whether `[start, end)` (local minutes) is free in the room on `day`, and what is around it. */
export function windowFit(
  day: LocalDate,
  facility: FacilityRules,
  busy: readonly BusyInterval[],
  now: Date,
  start: number,
  end: number,
): WindowFit {
  const spans = busySpans(day, facility, busy);
  const current = nowMinutes(day, facility, now);
  const conflicts = spans.filter((span) => overlaps(span, start, end));
  const earliest = Math.max(facility.opensAt, Math.ceil(current / slotMinutes) * slotMinutes);

  // Free before: from the last busy end before the window (or the earliest bookable minute) to the first busy start
  // after that point, never past the window's start.
  const before = Math.max(earliest, ...spans.filter((span) => span.end <= start).map((span) => span.end));
  const beforeEnd = Math.min(start, ...spans.filter((span) => span.start >= before).map((span) => span.start));
  // Free after: from when busy time covering the window's end is over, to the next busy start (or closing).
  const afterStart = freeAgainFrom(spans, end);
  const next = spans.find((span) => span.start >= afterStart)?.start ?? null;
  const after = Math.min(facility.closesAt, next ?? facility.closesAt);
  // On a conflict, the room is free again once the busy time that starts the conflict (and any back to back) ends.
  const again = freeAgainFrom(spans, conflicts[0]?.start ?? start);

  let state: WindowState = "free";
  if (!isOpenWeekday(day, facility)) state = "closed";
  else if (start < facility.opensAt || end > facility.closesAt) state = "outside_hours";
  else if (start < current) state = "past";
  else if (conflicts.length > 0) state = "conflict";

  return {
    state,
    conflicts,
    freeBefore: before < beforeEnd ? { start: before, end: beforeEnd } : null,
    freeAfter: after > afterStart ? { start: afterStart, end: after } : null,
    nextBusy: next !== null && next < facility.closesAt ? next : null,
    freeFrom: conflicts.length > 0 && again < facility.closesAt ? again : null,
  };
}

export const ROOM_NOW_STATES = ["free", "busy", "blocked", "closed"] as const;
export type RoomNowState = (typeof ROOM_NOW_STATES)[number];

/** The room right now: free until its next busy time (or closing), busy or blocked until it frees, or closed. */
export function roomNow(
  facility: FacilityRules,
  busy: readonly BusyInterval[],
  now: Date,
): { readonly state: RoomNowState; readonly until: number | null } {
  const today = todayAt(now, facility.timeZone);
  const minutes = localMinutesOf(now, facility.timeZone);
  if (!isOpenWeekday(today, facility) || minutes < facility.opensAt || minutes >= facility.closesAt) {
    return { state: "closed", until: null };
  }
  const spans = busySpans(today, facility, busy);
  const here = spans.filter((span) => span.start <= minutes && span.end > minutes);
  if (here.length > 0) {
    const until = Math.min(freeAgainFrom(spans, minutes), facility.closesAt);
    return { state: here.some((span) => span.kind === "blocked") ? "blocked" : "busy", until };
  }
  const next = spans.find((span) => span.start > minutes)?.start ?? facility.closesAt;
  return { state: "free", until: Math.min(next, facility.closesAt) };
}

/** The longest range the room calendar reads at once, in days (six weeks: a month view with its edges). */
export const AVAILABILITY_RANGE_MAX_DAYS = 42;

/**
 * Every start on the 30 minute grid where a booking of `minutes` fits free in the room on `day` (spec 0008): inside
 * opening hours, not started yet, no busy time inside. A closed day has none. The same answer as asking `windowFit`
 * for each start, with the day's busy time and clock read once: the booking search runs it for every room and day of
 * a month in the browser.
 */
export function freeStarts(
  day: LocalDate,
  facility: FacilityRules,
  busy: readonly BusyInterval[],
  now: Date,
  minutes: number,
): number[] {
  if (!isOpenWeekday(day, facility)) return [];
  const spans = busySpans(day, facility, busy);
  const current = nowMinutes(day, facility, now);
  const starts: number[] = [];
  for (let start = facility.opensAt; start + minutes <= facility.closesAt; start += slotMinutes) {
    if (start >= current && !spans.some((span) => overlaps(span, start, start + minutes))) starts.push(start);
  }
  return starts;
}

/** Durations a search offers, in minutes, within the booking limits: 30 minutes to 4 hours. */
export const BOOKING_DURATIONS = [30, 60, 90, 120, 180, 240] as const;
