import { parseLocalDate, zonedInstant } from "@espacios/domain";

import { minutesOf } from "./format";

/**
 * Days and times the operator types are read in the sede's zone (spec 0005, Value sourcing), which only the server
 * knows: the form never sends it. `null` when a day or a time cannot be read (the action answers `invalid_input`).
 */
export function zonedPeriod(
  input: { readonly startDate: string; readonly startTime: string; readonly endDate: string; readonly endTime: string },
  timeZone: string,
): { readonly startsAt: Date; readonly endsAt: Date } | null {
  const startDay = parseLocalDate(input.startDate);
  const endDay = parseLocalDate(input.endDate);
  const start = minutesOf(input.startTime);
  const end = minutesOf(input.endTime);
  if (!startDay || !endDay || Number.isNaN(start) || Number.isNaN(end)) return null;
  return { startsAt: zonedInstant(startDay, start, timeZone), endsAt: zonedInstant(endDay, end, timeZone) };
}

/** "Disponible desde": the start of that day in the sede's zone. */
export function startOfZonedDay(day: string, timeZone: string): Date | null {
  const date = parseLocalDate(day);
  return date ? zonedInstant(date, 0, timeZone) : null;
}
