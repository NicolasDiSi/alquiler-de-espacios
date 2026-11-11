import { fail, ok, type Result } from "../shared/result";
import {
  addDays,
  isWholeMinute,
  type LocalDate,
  localDateOf,
  localMinutesOf,
  weekdayOf,
  zonedInstant,
} from "./calendar";

/**
 * The booking rules of spec 0001 ("Booking rules"), the values the README "Supuestos" lists. Times are minutes since
 * local midnight in the facility's zone.
 */
export const BOOKING_RULES = {
  /** Starts and ends fall on these marks. */
  slotMinutes: 30,
  /** Monday to Friday (as `Date.getDay`). Holidays are ignored, a known limitation. */
  openWeekdays: [1, 2, 3, 4, 5],
  opensAt: 8 * 60,
  closesAt: 20 * 60,
  minMinutes: 30,
  maxMinutes: 4 * 60,
  /** A booking may start on any day up to this many days after today (local days, today counts as 0). */
  horizonDays: 60,
} as const;

/** The two instants of a booking, `[startsAt, endsAt)`. */
export type BookingPeriod = {
  readonly startsAt: Date;
  readonly endsAt: Date;
};

const MINUTE_MS = 60_000;

export function isOpenWeekday(date: LocalDate): boolean {
  return (BOOKING_RULES.openWeekdays as readonly number[]).includes(weekdayOf(date));
}

/** The facility's today at `now`. */
export function todayAt(now: Date): LocalDate {
  return localDateOf(now);
}

/** The last day a booking may start on, seen from `now`. */
export function lastBookableDay(now: Date): LocalDate {
  return addDays(todayAt(now), BOOKING_RULES.horizonDays);
}

function isOnGrid(instant: Date): boolean {
  return isWholeMinute(instant) && localMinutesOf(instant) % BOOKING_RULES.slotMinutes === 0;
}

/**
 * Checks a requested booking against every rule except overlap (the database guards that, spec 0001). One reason per
 * rule, checked in this order: order and same day (`invalid_range`), length (`too_short`, `too_long`), the 30 minute
 * marks (`not_on_grid`), opening days and hours (`outside_hours`), the past (`past_date`, a start must be after
 * `now`) and the horizon (`beyond_horizon`). Length comes before the marks so that 10:00 to 10:15 says "too short".
 */
export function validateBooking(period: BookingPeriod, now: Date): Result<BookingPeriod> {
  const { startsAt, endsAt } = period;
  const day = localDateOf(startsAt);
  if (endsAt.getTime() <= startsAt.getTime() || localDateOf(endsAt) !== day) return fail("invalid_range");

  const minutes = (endsAt.getTime() - startsAt.getTime()) / MINUTE_MS;
  if (minutes < BOOKING_RULES.minMinutes) return fail("too_short");
  if (minutes > BOOKING_RULES.maxMinutes) return fail("too_long");

  if (!isOnGrid(startsAt) || !isOnGrid(endsAt)) return fail("not_on_grid");

  const opens = zonedInstant(day, BOOKING_RULES.opensAt).getTime();
  const closes = zonedInstant(day, BOOKING_RULES.closesAt).getTime();
  if (!isOpenWeekday(day) || startsAt.getTime() < opens || endsAt.getTime() > closes) return fail("outside_hours");

  if (startsAt.getTime() <= now.getTime()) return fail("past_date");
  if (day > lastBookableDay(now)) return fail("beyond_horizon");

  return ok({ startsAt, endsAt });
}
