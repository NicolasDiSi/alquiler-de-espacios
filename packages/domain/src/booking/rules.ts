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
import type { FacilityRules } from "./facility";

/**
 * The booking rules every facility shares (spec 0001 "Booking rules"; the values the README "Supuestos" lists). The
 * zone, the opening hours and the open weekdays are not here: each facility has its own (`FacilityRules`, spec 0004).
 */
export const BOOKING_RULES = {
  /** Starts and ends fall on these marks. */
  slotMinutes: 30,
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

export function isOpenWeekday(date: LocalDate, facility: Pick<FacilityRules, "openWeekdays">): boolean {
  return facility.openWeekdays.includes(weekdayOf(date));
}

/** The facility's today at `now`. */
export function todayAt(now: Date, timeZone: string): LocalDate {
  return localDateOf(now, timeZone);
}

/** The last day a booking may start on, seen from `now`. */
export function lastBookableDay(now: Date, timeZone: string): LocalDate {
  return addDays(todayAt(now, timeZone), BOOKING_RULES.horizonDays);
}

function isOnGrid(instant: Date, timeZone: string): boolean {
  return isWholeMinute(instant, timeZone) && localMinutesOf(instant, timeZone) % BOOKING_RULES.slotMinutes === 0;
}

/**
 * Checks a requested booking against every rule except overlap (the database guards that, spec 0001). One reason per
 * rule, checked in this order: order and same day (`invalid_range`), length (`too_short`, `too_long`), the 30 minute
 * marks (`not_on_grid`), opening days and hours (`outside_hours`), the past (`past_date`, a start must be after
 * `now`) and the horizon (`beyond_horizon`). Length comes before the marks so that 10:00 to 10:15 says "too short".
 */
export function validateBooking(period: BookingPeriod, now: Date, facility: FacilityRules): Result<BookingPeriod> {
  const { startsAt, endsAt } = period;
  const { timeZone } = facility;
  const day = localDateOf(startsAt, timeZone);
  if (endsAt.getTime() <= startsAt.getTime() || localDateOf(endsAt, timeZone) !== day) return fail("invalid_range");

  const minutes = (endsAt.getTime() - startsAt.getTime()) / MINUTE_MS;
  if (minutes < BOOKING_RULES.minMinutes) return fail("too_short");
  if (minutes > BOOKING_RULES.maxMinutes) return fail("too_long");

  if (!isOnGrid(startsAt, timeZone) || !isOnGrid(endsAt, timeZone)) return fail("not_on_grid");

  const opens = zonedInstant(day, facility.opensAt, timeZone).getTime();
  const closes = zonedInstant(day, facility.closesAt, timeZone).getTime();
  if (!isOpenWeekday(day, facility) || startsAt.getTime() < opens || endsAt.getTime() > closes)
    return fail("outside_hours");

  if (startsAt.getTime() <= now.getTime()) return fail("past_date");
  if (day > lastBookableDay(now, timeZone)) return fail("beyond_horizon");

  return ok({ startsAt, endsAt });
}
