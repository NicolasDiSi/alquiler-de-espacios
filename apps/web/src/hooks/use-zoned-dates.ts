import { useMemo } from "react";

import { useFormatter } from "next-intl";

import { formats } from "@/i18n/config";

/**
 * Dates in a given zone with the catalog's formats (spec 0005): a block or a booking shows the sede's own clock, not
 * the app's default zone. Takes a `Date` or an RFC 3339 string, as views carry. Stable per zone, so table columns
 * built with it stay stable too.
 */
export function useZonedDates(timeZone: string) {
  const format = useFormatter();
  return useMemo(() => {
    const toDate = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);
    return {
      day: (value: Date | string) => format.dateTime(toDate(value), { ...formats.dateTime.short, timeZone }),
      moment: (value: Date | string) => format.dateTime(toDate(value), { ...formats.dateTime.dateTime, timeZone }),
    };
  }, [format, timeZone]);
}
