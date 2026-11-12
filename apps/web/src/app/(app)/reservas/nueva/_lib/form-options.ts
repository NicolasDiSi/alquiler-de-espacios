import {
  endTimes,
  type FacilityRules,
  isBookableDay,
  nextOpenDay,
  parseLocalDate,
  type StartOption,
  startOptions,
  startTimes,
} from "@espacios/domain";

import type { BookingFormField, BookingFormValues } from "@/lib/bookings/input";

/** What the form needs of a room: its id and the facility whose zone, hours and open days shape the lists (spec 0004). */
export type FormRoom = { readonly id: string; readonly facility: FacilityRules };

/** Only read when a form has no room at all, which the page never renders. Open every day, all day, in UTC. */
const NO_ROOM: FacilityRules = { timeZone: "UTC", opensAt: 0, closesAt: 1440, openWeekdays: [0, 1, 2, 3, 4, 5, 6] };

/**
 * The facility the lists follow: the chosen room's, or, until a room is chosen, the first room's. The server checks
 * everything against the room's real facility on submit, so this only shapes what the form offers.
 */
export function facilityFor(roomId: string, rooms: readonly FormRoom[]): FacilityRules {
  return (rooms.find((room) => room.id === roomId) ?? rooms[0])?.facility ?? NO_ROOM;
}

/** The start list for the chosen day: on today the starts already passed are disabled (spec 0003, AC-7). */
export function startChoices(date: string, now: Date, facility: FacilityRules): StartOption[] {
  const day = parseLocalDate(date);
  return day ? startOptions(day, now, facility) : startTimes(facility).map((time) => ({ time, disabled: false }));
}

function startFits(start: string, date: string, now: Date, facility: FacilityRules): boolean {
  return startChoices(date, now, facility).some((option) => option.time === start && !option.disabled);
}

/**
 * Dependent fields (spec 0003): a change that leaves the start or the end outside its new list clears that field
 * (a later start, a switch to today with that start already passed, a room whose facility opens other hours); a value
 * that still fits is kept. A room whose facility is closed on the chosen day moves the date to its next open day.
 */
export function withChange(
  values: BookingFormValues,
  field: BookingFormField,
  value: string,
  now: Date,
  rooms: readonly FormRoom[],
): BookingFormValues {
  const next = { ...values, [field]: value };
  const facility = facilityFor(next.roomId, rooms);
  const day = parseLocalDate(next.date);
  if (field === "roomId" && day && !isBookableDay(day, now, facility)) next.date = nextOpenDay(now, facility);
  if (next.start !== "" && !startFits(next.start, next.date, now, facility)) next.start = "";
  if (next.end !== "" && !endTimes(next.start, facility).includes(next.end)) next.end = "";
  return next;
}

/** The `/reservas/nueva` query: `sala`, `fecha`, `inicio`, `fin` (spec 0003, AC-8). Untrusted. */
export type PrefillParams = Partial<Record<"sala" | "fecha" | "inicio" | "fin", string | string[]>>;

const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

/**
 * The form's first values. Each prefilled value is kept only when it is one the form itself would offer: a known room,
 * a bookable day, a start on the list and not passed, an end that fits the start, all read in the room's facility.
 * Anything else falls back to its default (the next open day, or empty). The server checks everything again on submit.
 */
export function initialBookingValues(now: Date, params: PrefillParams, rooms: readonly FormRoom[]): BookingFormValues {
  const sala = rooms.some((room) => room.id === single(params.sala)) ? single(params.sala) : "";
  const facility = facilityFor(sala, rooms);
  const fecha = parseLocalDate(single(params.fecha));
  const date = fecha && isBookableDay(fecha, now, facility) ? fecha : nextOpenDay(now, facility);
  const inicio = single(params.inicio);
  const start = startFits(inicio, date, now, facility) ? inicio : "";
  const fin = single(params.fin);
  return {
    roomId: sala,
    date,
    start,
    end: endTimes(start, facility).includes(fin) ? fin : "",
  };
}
