import { LOCALE } from "@/i18n/config";

/**
 * Numbers, hours and dates of the dashboard, in es-AR. Plain functions so Server and Client Components share them. Words
 * never live here: a unit Intl does not write ("pts") comes from the catalog.
 */

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wholePercent = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 0 });
const hours = new Intl.NumberFormat(LOCALE, {
  style: "unit",
  unit: "hour",
  unitDisplay: "narrow",
  maximumFractionDigits: 0,
});
const decimalHours = new Intl.NumberFormat(LOCALE, {
  style: "unit",
  unit: "hour",
  unitDisplay: "narrow",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
// Local days are plain dates: read them at UTC midnight so no zone moves them.
const day = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const range = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const month = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" });

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export const formatInteger = (value: number) => integer.format(value);
export const formatDecimal = (value: number) => decimal.format(value);
/** `ratio` is 0 to 1. */
export const formatPercent = (ratio: number) => percent.format(ratio);
export const formatWholePercent = (ratio: number) => wholePercent.format(ratio);
export const formatHours = (minutes: number) => hours.format(minutes / 60);
export const formatDecimalHours = (value: number) => decimalHours.format(value);

/** Inclusive local days, for example "13 oct al 11 nov 2026". */
export const formatDateRange = (from: string, to: string) => range.formatRange(utc(from), utc(to));
/** For example "mié, 14 oct". */
export const formatDay = (date: string) => day.format(utc(date));
/** For example "oct". */
export const formatMonth = (date: string) => month.format(utc(date)).replace(".", "");

/** A signed magnitude: "+", the minus sign, or nothing for zero. */
export function signOf(value: number) {
  if (value > 0) return "+";
  if (value < 0) return "−";
  return "";
}

/** An hour of the day as "09". */
export const pad = (hour: number) => String(hour).padStart(2, "0");
