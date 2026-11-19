import { addDays, formatTime, type LocalDate, parseTime, zonedInstant } from "./calendar";
import type { FacilityRules } from "./facility";
import { BOOKING_RULES, isOpenWeekday, lastBookableDay, todayAt } from "./rules";

/**
 * What the booking form offers (spec 0003, AC-7). These only shape the form so most mistakes cannot be made; the
 * server checks every rule again with `validateBooking`.
 */

const { slotMinutes, minMinutes, maxMinutes } = BOOKING_RULES;

function marks(from: number, to: number): string[] {
  const times: string[] = [];
  for (let minutes = from; minutes <= to; minutes += slotMinutes) times.push(formatTime(minutes));
  return times;
}

/** The last start that still leaves the shortest booking before closing (19:30 for a facility that closes at 20:00). */
function lastStart(facility: FacilityRules): number {
  return facility.closesAt - minMinutes;
}

/** Every start the form lists for a facility: from its opening, every 30 minutes, up to the last that still fits. */
export function startTimes(facility: FacilityRules): readonly string[] {
  return marks(facility.opensAt, lastStart(facility));
}

/** A start option; on today the ones already passed are listed but disabled. */
export type StartOption = { readonly time: string; readonly disabled: boolean };

export function startOptions(day: LocalDate, now: Date, facility: FacilityRules): StartOption[] {
  return startTimes(facility).map((time) => ({
    time,
    disabled: zonedInstant(day, parseTime(time) ?? 0, facility.timeZone).getTime() <= now.getTime(),
  }));
}

/** The ends that fit a start: from 30 minutes after it up to 4 hours after it, never after closing. */
export function endTimes(start: string, facility: FacilityRules): string[] {
  const from = parseTime(start);
  if (from === null || !startTimes(facility).includes(start)) return [];
  return marks(from + minMinutes, Math.min(from + maxMinutes, facility.closesAt));
}

/** A day the calendar lets you pick: a day the facility opens, not before today, at most 60 days ahead. */
export function isBookableDay(day: LocalDate, now: Date, facility: FacilityRules): boolean {
  return (
    isOpenWeekday(day, facility) &&
    day >= todayAt(now, facility.timeZone) &&
    day <= lastBookableDay(now, facility.timeZone)
  );
}

/**
 * The day the form opens on: today when the facility opens today and a start is still ahead, otherwise the next day it
 * opens. A facility has at least one open weekday (a database check), so the loop ends.
 */
export function nextOpenDay(now: Date, facility: FacilityRules): LocalDate {
  const today = todayAt(now, facility.timeZone);
  if (
    isOpenWeekday(today, facility) &&
    now.getTime() < zonedInstant(today, lastStart(facility), facility.timeZone).getTime()
  ) {
    return today;
  }
  let day = addDays(today, 1);
  while (!isOpenWeekday(day, facility)) day = addDays(day, 1);
  return day;
}
