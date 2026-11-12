import { parseTime } from "@espacios/domain";

/** Weekdays in the order shown, Monday first. Values are `Date.getDay` numbers (0 Sunday to 6 Saturday). */
export const WEEKDAYS_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

/** A weekday as the key of its label in the catalog (`operator.weekdays.short.1` is "L"). */
export type WeekdayKey = `${(typeof WEEKDAYS_MONDAY_FIRST)[number]}`;
export const weekdayKey = (day: number) => String(day) as WeekdayKey;

/** The zones the sede dialog offers (spec 0005). Buenos Aires first, the default. The server accepts any IANA name. */
const TIME_ZONES = [
  "America/Argentina/Buenos_Aires",
  "America/Argentina/Cordoba",
  "America/Argentina/Mendoza",
  "America/Montevideo",
  "America/Santiago",
  "America/Asuncion",
  "America/La_Paz",
  "America/Lima",
  "America/Bogota",
  "America/Caracas",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "UTC",
] as const;

/** The zone options for a form: the list, plus the sede's own zone when it is not in it. */
export function zoneOptions(current?: string): readonly string[] {
  return current && !(TIME_ZONES as readonly string[]).includes(current) ? [...TIME_ZONES, current] : TIME_ZONES;
}

/** Minutes from midnight as `HH:mm`; unlike the domain's, `1440` is `24:00` (a sede may close at midnight). */
export function markOfMinutes(minutes: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Every 30 minute mark of a day as `HH:mm`, `00:00` to `24:00`. */
export const DAY_MARKS: readonly string[] = Array.from({ length: 49 }, (_, index) => markOfMinutes(index * 30));

/** `HH:mm` to minutes, or `NaN` when it is not a time (the use case then answers `invalid_input`). */
export const minutesOf = (text: string): number => (text === "24:00" ? 1440 : (parseTime(text) ?? Number.NaN));

/** The client code suggested from a name: lowercase, no accents, words joined by `-`, at most 63 characters. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

/** The first letters of up to two words, for an avatar without a logo. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/**
 * A zone as people read it: the city of its IANA name and its offset now ("Buenos Aires, GMT-3"). The IANA name stays
 * the value; this is only its label.
 */
export function zoneLabel(timeZone: string, now = new Date()): string {
  if (timeZone === "UTC") return "UTC";
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const offset = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;
  return offset ? `${city}, ${offset}` : city;
}
