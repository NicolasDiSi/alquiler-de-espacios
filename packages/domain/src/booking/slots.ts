import { addDays, formatTime, type LocalDate, parseTime, zonedInstant } from "./calendar";
import { BOOKING_RULES, isOpenWeekday, lastBookableDay, todayAt } from "./rules";

/**
 * What the booking form offers (spec 0003, AC-7). These only shape the form so most mistakes cannot be made; the
 * server checks every rule again with `validateBooking`.
 */

const { slotMinutes, opensAt, closesAt, minMinutes, maxMinutes } = BOOKING_RULES;

/** The last start that still leaves the shortest booking before closing: 19:30. */
const LAST_START = closesAt - minMinutes;

function marks(from: number, to: number): string[] {
  const times: string[] = [];
  for (let minutes = from; minutes <= to; minutes += slotMinutes) times.push(formatTime(minutes));
  return times;
}

/** Every start the form lists, 08:00 to 19:30 every 30 minutes. */
export const START_TIMES: readonly string[] = marks(opensAt, LAST_START);

/** A start option; on today the ones already passed are listed but disabled. */
export type StartOption = { readonly time: string; readonly disabled: boolean };

export function startOptions(day: LocalDate, now: Date): StartOption[] {
  return START_TIMES.map((time) => ({
    time,
    disabled: zonedInstant(day, parseTime(time) ?? 0).getTime() <= now.getTime(),
  }));
}

/** The ends that fit a start: from 30 minutes after it up to 4 hours after it, never after 20:00. */
export function endTimes(start: string): string[] {
  const from = parseTime(start);
  if (from === null || !START_TIMES.includes(start)) return [];
  return marks(from + minMinutes, Math.min(from + maxMinutes, closesAt));
}

/** A day the calendar lets you pick: Monday to Friday, not before today, at most 60 days ahead. */
export function isBookableDay(day: LocalDate, now: Date): boolean {
  return isOpenWeekday(day) && day >= todayAt(now) && day <= lastBookableDay(now);
}

/**
 * The day the form opens on: today when it is a weekday and a start is still ahead (before 19:30), otherwise the
 * next weekday.
 */
export function nextOpenDay(now: Date): LocalDate {
  const today = todayAt(now);
  if (isOpenWeekday(today) && now.getTime() < zonedInstant(today, LAST_START).getTime()) return today;
  let day = addDays(today, 1);
  while (!isOpenWeekday(day)) day = addDays(day, 1);
  return day;
}
