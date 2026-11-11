import { isTimeZone } from "../booking/calendar";
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
