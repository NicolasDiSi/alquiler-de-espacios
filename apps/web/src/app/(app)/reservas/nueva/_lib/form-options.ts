import {
  endTimes,
  isBookableDay,
  nextOpenDay,
  parseLocalDate,
  START_TIMES,
  type StartOption,
  startOptions,
} from "@espacios/domain";

import type { BookingFormField, BookingFormValues } from "@/lib/bookings/input";

/** The start list for the chosen day: on today the starts already passed are disabled (spec 0003, AC-7). */
export function startChoices(date: string, now: Date): StartOption[] {
  const day = parseLocalDate(date);
  return day ? startOptions(day, now) : START_TIMES.map((time) => ({ time, disabled: false }));
}

function startFits(start: string, date: string, now: Date): boolean {
  return startChoices(date, now).some((option) => option.time === start && !option.disabled);
}

/**
 * Dependent fields (spec 0003): a change that leaves the start or the end outside its new list clears that field
 * (a later start, a switch to today with that start already passed); a value that still fits is kept.
 */
export function withChange(
  values: BookingFormValues,
  field: BookingFormField,
  value: string,
  now: Date,
): BookingFormValues {
  const next = { ...values, [field]: value };
  if (next.start !== "" && !startFits(next.start, next.date, now)) next.start = "";
  if (next.end !== "" && !endTimes(next.start).includes(next.end)) next.end = "";
  return next;
}

/** The `/reservas/nueva` query: `sala`, `fecha`, `inicio`, `fin` (spec 0003, AC-8). Untrusted. */
export type PrefillParams = Partial<Record<"sala" | "fecha" | "inicio" | "fin", string | string[]>>;

const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

/**
 * The form's first values. Each prefilled value is kept only when it is one the form itself would offer: a known room,
 * a bookable day, a start on the list and not passed, an end that fits the start. Anything else falls back to its
 * default (the next open day, or empty). The server checks everything again on submit.
 */
export function initialBookingValues(now: Date, params: PrefillParams, roomIds: readonly string[]): BookingFormValues {
  const sala = single(params.sala);
  const fecha = parseLocalDate(single(params.fecha));
  const date = fecha && isBookableDay(fecha, now) ? fecha : nextOpenDay(now);
  const inicio = single(params.inicio);
  const start = startFits(inicio, date, now) ? inicio : "";
  const fin = single(params.fin);
  return {
    roomId: roomIds.includes(sala) ? sala : "",
    date,
    start,
    end: endTimes(start).includes(fin) ? fin : "",
  };
}
