import type { Formats } from "next-intl";

/** The web app speaks Spanish (Argentina); the catalog is `messages/es.json`. English is added later as a file. */
export const LOCALE = "es-AR";
export const TIME_ZONE = "America/Argentina/Buenos_Aires";

export const formats = {
  dateTime: {
    short: { day: "2-digit", month: "2-digit", year: "numeric" },
    long: { day: "numeric", month: "long", year: "numeric" },
    dateTime: {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
    time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  },
  number: {
    integer: { maximumFractionDigits: 0 },
    decimal: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    percent: { style: "percent", maximumFractionDigits: 1 },
  },
} satisfies Formats;
