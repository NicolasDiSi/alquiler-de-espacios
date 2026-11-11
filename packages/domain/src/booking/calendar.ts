import type { Brand } from "../shared/brand";

/**
 * The facility's calendar (spec 0001, "Booking rules"): one zone, given by its IANA name and never as a fixed offset.
 * Instants are stored in UTC; every rule about days and opening hours is read in this zone. The math uses
 * `Intl.DateTimeFormat` only, so it runs the same on the server and in the browser, with no library.
 */
export const FACILITY_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** A day on the facility's calendar, `YYYY-MM-DD`. Built only through `parseLocalDate` or the helpers here. */
export type LocalDate = Brand<string, "LocalDate">;

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: FACILITY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type WallClock = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
};

/** What a wall clock in the facility shows at `instant`. */
function wallClock(instant: Date): WallClock {
  const parts = PARTS_FORMAT.formatToParts(instant).map((part) => [part.type, Number(part.value)]);
  // `formatToParts` always returns these six fields for the options above.
  return Object.fromEntries(parts) as WallClock;
}

/** Minutes the facility's clock is ahead of UTC at `instant` (Buenos Aires: -180). */
export function facilityOffsetMinutes(instant: Date): number {
  const clock = wallClock(instant);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  const wholeSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - wholeSeconds) / MINUTE_MS);
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

function toLocalDate(year: number, month: number, day: number): LocalDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}` as LocalDate;
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` of a real calendar day, or `null` (`2026-02-30` is not a day). */
export function parseLocalDate(text: string): LocalDate | null {
  const match = LOCAL_DATE.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  const real = probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
  return real ? toLocalDate(year, month, day) : null;
}

function dateParts(date: LocalDate): [number, number, number] {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  return [year, month, day];
}

/** The facility day `instant` falls on. */
export function localDateOf(instant: Date): LocalDate {
  const clock = wallClock(instant);
  return toLocalDate(clock.year, clock.month, clock.day);
}

/** Minutes since local midnight at `instant` (10:30 is 630). Seconds are dropped. */
export function localMinutesOf(instant: Date): number {
  const clock = wallClock(instant);
  return clock.hour * 60 + clock.minute;
}

/** True when `instant` is exactly on a whole minute of the facility's clock (no seconds, no milliseconds). */
export function isWholeMinute(instant: Date): boolean {
  return wallClock(instant).second === 0 && instant.getUTCMilliseconds() === 0;
}

/** The day `days` after `date` (negative goes back). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = dateParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return toLocalDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** 0 is Sunday, 1 Monday ... 6 Saturday, as `Date.getDay`. */
export function weekdayOf(date: LocalDate): number {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * The instant at which the facility's clock shows `minutes` past midnight on `date`. The offset is read twice, so a
 * zone that changes its offset that day still lands on the right instant.
 */
export function zonedInstant(date: LocalDate, minutes: number): Date {
  const [year, month, day] = dateParts(date);
  const asUtc = Date.UTC(year, month - 1, day, 0, minutes);
  const firstGuess = asUtc - facilityOffsetMinutes(new Date(asUtc)) * MINUTE_MS;
  const offset = facilityOffsetMinutes(new Date(firstGuess));
  return new Date(asUtc - offset * MINUTE_MS);
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `HH:mm` (24 hours) to minutes since midnight, or `null`. */
export function parseTime(text: string): number | null {
  const match = TIME.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Minutes since midnight to `HH:mm`. */
export function formatTime(minutes: number): string {
  const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** RFC 3339 in the facility's zone, the API's output format: `2026-11-12T10:00:00-03:00`. */
export function toFacilityIso(instant: Date): string {
  const clock = wallClock(instant);
  const offset = facilityOffsetMinutes(instant);
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  const date = toLocalDate(clock.year, clock.month, clock.day);
  const time = `${pad(clock.hour)}:${pad(clock.minute)}:${pad(clock.second)}`;
  return `${date}T${time}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}
