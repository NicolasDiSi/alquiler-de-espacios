import { isTimeZone, localDateOf, weekdayOf, zonedInstant } from "../booking/calendar";
import type { FacilityRules } from "../booking/facility";
import { fail, ok, type Result } from "../shared/result";

const DAY_MINUTES = 24 * 60;
const MARK_MINUTES = 30;

/**
 * What a facility the operator writes must satisfy (spec 0004, AC-2): a real IANA zone, hours on the 30 minute marks
 * inside one day with the opening before the closing, and at least one open weekday (0 Sunday to 6 Saturday, no
 * repeats). The same rules are `CHECK`s in the database; this gives the operator a clear `invalid_input` first.
 */
export function validateFacilityRules(rules: FacilityRules): Result<FacilityRules> {
  const { timeZone, opensAt, closesAt, openWeekdays } = rules;
  const onMarks = (minutes: number) => Number.isInteger(minutes) && minutes % MARK_MINUTES === 0;
  const validWeekdays =
    openWeekdays.length > 0 &&
    new Set(openWeekdays).size === openWeekdays.length &&
    openWeekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const valid =
    isTimeZone(timeZone) &&
    onMarks(opensAt) &&
    onMarks(closesAt) &&
    opensAt >= 0 &&
    closesAt <= DAY_MINUTES &&
    opensAt < closesAt &&
    validWeekdays;
  return valid ? ok(rules) : fail("invalid_input");
}

/** True when two sets of rules differ in anything a booking's validity depends on (spec 0004, AC-6). */
export function changesBookingRules(current: FacilityRules, next: FacilityRules): boolean {
  const days = (rules: FacilityRules) => [...rules.openWeekdays].sort().join(",");
  return (
    current.timeZone !== next.timeZone ||
    current.opensAt !== next.opensAt ||
    current.closesAt !== next.closesAt ||
    days(current) !== days(next)
  );
}

/**
 * Whether a booking still fits a facility's rules: it starts and ends on one local day that the facility opens, inside
 * the opening hours, read in the facility's zone. The same test the database guard applies on insert.
 */
export function fitsFacilityRules(booking: { startsAt: Date; endsAt: Date }, rules: FacilityRules): boolean {
  const day = localDateOf(booking.startsAt, rules.timeZone);
  if (localDateOf(booking.endsAt, rules.timeZone) !== day && booking.endsAt.getTime() !== closing(day, rules)) {
    return false;
  }
  return (
    rules.openWeekdays.includes(weekdayOf(day)) &&
    booking.startsAt.getTime() >= zonedInstant(day, rules.opensAt, rules.timeZone).getTime() &&
    booking.endsAt.getTime() <= closing(day, rules)
  );
}

const closing = (day: Parameters<typeof zonedInstant>[0], rules: FacilityRules) =>
  zonedInstant(day, rules.closesAt, rules.timeZone).getTime();
