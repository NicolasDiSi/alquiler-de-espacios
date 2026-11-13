import type { RoomView } from "@espacios/application";
import {
  addDays,
  BOOKING_DURATIONS,
  BOOKING_RULES,
  type FacilityRules,
  isBookableDay,
  type LocalDate,
  nextOpenDay,
  parseLocalDate,
  parseTime,
  weekdayOf,
  zonedInstant,
} from "@espacios/domain";

/**
 * The booking search of spec 0008, mirrored in the URL so a search can be shared or reloaded:
 * `?sede&mes&fecha&inicio&duracion&personas&sala&libres`. Only the sede and the month are data the server reads; the
 * rest is the browser's to apply. Untrusted: every value the search would not offer falls back to its default (the
 * sede's next open day, one hour, one person, no start, no room). The server checks every booking rule again when a
 * booking is confirmed.
 */

export const PEOPLE_MAX = 40;
const DEFAULT_MINUTES = 60;

export type SearchParams = Partial<
  Record<"sede" | "fecha" | "mes" | "inicio" | "duracion" | "personas" | "sala" | "libres", string | string[]>
>;

export type BookingSearch = {
  readonly facilityId: string;
  readonly date: LocalDate;
  /** The month the calendar shows, as its first day; the chosen day's month unless the user moved it. */
  readonly month: LocalDate;
  /** Local minutes on the 30 minute grid, or `null` until a start is chosen. */
  readonly start: number | null;
  readonly minutes: number;
  readonly people: number;
  readonly roomId: string | null;
  /** Rooms busy in the window are hidden (the default) or listed after the free ones. */
  readonly onlyFree: boolean;
};

const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

/** The sedes the rooms belong to, by name, each with the rules its rooms share. */
export function facilitiesOf(rooms: readonly RoomView[]) {
  return [...new Map(rooms.map((room) => [room.facility.id, room.facility])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Whether `[start, start + minutes)` is a start the search offers on `date`: on the grid, in hours, not started. */
function offersStart(date: LocalDate, start: number, minutes: number, facility: FacilityRules, now: Date) {
  return (
    start % BOOKING_RULES.slotMinutes === 0 &&
    start >= facility.opensAt &&
    start + minutes <= facility.closesAt &&
    zonedInstant(date, start, facility.timeZone).getTime() > now.getTime()
  );
}

export function readSearch(now: Date, params: SearchParams, rooms: readonly RoomView[]): BookingSearch | null {
  const facilities = facilitiesOf(rooms);
  const fromRoom = rooms.find((room) => room.id === single(params.sala))?.facility.id;
  const facility =
    facilities.find((item) => item.id === single(params.sede)) ??
    facilities.find((item) => item.id === fromRoom) ??
    facilities[0];
  if (!facility) return null;

  const asked = parseLocalDate(single(params.fecha));
  const fallback = nextOpenDay(now, facility);
  const month = parseLocalDate(`${single(params.mes)}-01`) ?? monthOf(asked ?? fallback);
  // A move to another month lands on its first bookable day, so the chosen day is always one the month data covers.
  const date =
    asked && isBookableDay(asked, now, facility) && monthOf(asked) === month
      ? asked
      : (firstBookableDay(month, now, facility) ?? fallback);
  const duration = Number(single(params.duracion));
  const minutes = (BOOKING_DURATIONS as readonly number[]).includes(duration) ? duration : DEFAULT_MINUTES;
  const start = parseTime(single(params.inicio));
  const people = Math.trunc(Number(single(params.personas)));
  const roomId = single(params.sala);

  return {
    facilityId: facility.id,
    date,
    month: monthOf(date),
    start: start !== null && offersStart(date, start, minutes, facility, now) ? start : null,
    minutes,
    people: people >= 1 && people <= PEOPLE_MAX ? people : 1,
    roomId: rooms.some((room) => room.id === roomId && room.facility.id === facility.id) ? roomId : null,
    onlyFree: single(params.libres) !== "0",
  };
}

/** The first day of `date`'s month. */
export const monthOf = (date: LocalDate) => `${date.slice(0, 7)}-01` as LocalDate;

/** The last day of the month that starts on `month`. */
function monthEnd(month: LocalDate): LocalDate {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month.slice(0, 8)}${String(last).padStart(2, "0")}` as LocalDate;
}

const pad = (value: number) => String(value).padStart(2, "0");
/** Local minutes as `HH:MM`. */
export const timeOf = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** The first day of `month` a booking can start on, or `null` when none is within the horizon. */
function firstBookableDay(month: LocalDate, now: Date, facility: FacilityRules): LocalDate | null {
  for (let day = month; day <= monthEnd(month); day = addDays(day, 1)) {
    if (isBookableDay(day, now, facility)) return day;
  }
  return null;
}

/**
 * The days the month's calendar shows (Monday before the first to six weeks later, as the calendar draws them with
 * fixed weeks): the range the search reads, so the week strip on a phone has its edges too.
 */
export function monthGrid(month: LocalDate): { readonly from: LocalDate; readonly to: LocalDate } {
  const from = addDays(month, -((weekdayOf(month) + 6) % 7));
  return { from, to: addDays(from, 41) };
}

/**
 * The search with some values changed. A change of sede, day or duration drops the start and the room; a day in
 * another month moves the month with it.
 */
export function patchSearch(search: BookingSearch, patch: Partial<BookingSearch>): BookingSearch {
  const next = { ...search, ...patch };
  const reset = (["facilityId", "date", "minutes"] as const).some((key) => key in patch && patch[key] !== search[key]);
  return {
    ...next,
    month: patch.date && !patch.month ? monthOf(next.date) : next.month,
    start: reset && !("start" in patch) ? null : next.start,
    roomId: reset && !("roomId" in patch) ? null : next.roomId,
  };
}

/** The search as a URL. */
export function searchHref(search: BookingSearch): string {
  const params = new URLSearchParams({
    sede: search.facilityId,
    mes: search.month.slice(0, 7),
    fecha: search.date,
    duracion: String(search.minutes),
    personas: String(search.people),
  });
  if (search.start !== null) params.set("inicio", timeOf(search.start));
  if (search.roomId) params.set("sala", search.roomId);
  if (!search.onlyFree) params.set("libres", "0");
  return `/reservas/nueva?${params}`;
}

/** The Monday of `date`'s week. */
export const mondayOf = (date: LocalDate) => addDays(date, -((weekdayOf(date) + 6) % 7));

const ROOMS_VIEWS = ["calendario", "grilla"] as const;
export type RoomsView = (typeof ROOMS_VIEWS)[number];

/**
 * `/salas` (spec 0009), mirrored in the URL: `?sede&fecha&personas&vista&tamano`. The server reads the sede and the week of
 * `fecha`; the day, the people and the view (the rooms as a calendar or as cards) are the browser's to apply.
 * Untrusted: an unknown sede falls back to the first, a malformed day to the sede's next open day, people outside 1 to
 * 40 to one, an unknown view to the calendar, an unknown size to all of them.
 */
export type RoomsSearch = {
  readonly facilityId: string;
  readonly date: LocalDate;
  readonly people: number;
  readonly view: RoomsView;
  readonly size: RoomSize;
};

export const ROOM_SIZES = ["todas", "pequenas", "medianas", "grandes"] as const;
/** The capacity bands of the quick filters (`?tamano`): small up to 4, medium 5 to 9, large 10 or more. */
export type RoomSize = (typeof ROOM_SIZES)[number];

const SIZE_FITS: Record<RoomSize, (capacity: number) => boolean> = {
  todas: () => true,
  pequenas: (capacity) => capacity <= 4,
  medianas: (capacity) => capacity >= 5 && capacity <= 9,
  grandes: (capacity) => capacity >= 10,
};

/** Whether a room of `capacity` falls in `size`. */
export const fitsSize = (capacity: number, size: RoomSize) => SIZE_FITS[size](capacity);

export function readRoomsSearch(
  now: Date,
  params: Partial<Record<"sede" | "fecha" | "personas" | "vista" | "tamano", string | string[]>>,
  rooms: readonly RoomView[],
): RoomsSearch | null {
  const facilities = facilitiesOf(rooms);
  const facility = facilities.find((item) => item.id === single(params.sede)) ?? facilities[0];
  if (!facility) return null;
  const people = Math.trunc(Number(single(params.personas)));
  return {
    facilityId: facility.id,
    date: parseLocalDate(single(params.fecha)) ?? nextOpenDay(now, facility),
    people: people >= 1 && people <= PEOPLE_MAX ? people : 1,
    view: ROOMS_VIEWS.find((view) => view === single(params.vista)) ?? "calendario",
    size: ROOM_SIZES.find((size) => size === single(params.tamano)) ?? "todas",
  };
}

export function roomsHref(search: RoomsSearch): string {
  const params = new URLSearchParams({
    sede: search.facilityId,
    fecha: search.date,
    personas: String(search.people),
    vista: search.view,
  });
  if (search.size !== "todas") params.set("tamano", search.size);
  return `/salas?${params}`;
}

export const SCHEDULE_VIEWS = ["mes", "semana", "dia"] as const;
/** How `/salas/[id]` shows the room's bookings (`?vista`): by month, week or day. Unknown values read as the month. */
export type ScheduleView = (typeof SCHEDULE_VIEWS)[number];

export const readScheduleView = (value: string | string[] | undefined): ScheduleView =>
  SCHEDULE_VIEWS.find((view) => view === single(value)) ?? "mes";

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-AR");

/** Whether a room's `name` matches the search `query`, ignoring case and accents. An empty query matches every room. */
export const matchesName = (name: string, query: string) => fold(name).includes(fold(query.trim()));
