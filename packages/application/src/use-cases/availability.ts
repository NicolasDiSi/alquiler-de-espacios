import {
  type Actor,
  AVAILABILITY_RANGE_MAX_DAYS,
  addDays,
  authorizeMember,
  BOOKING_RULES,
  type BusyInterval,
  type BusyKind,
  type DaySlot,
  daySlots,
  fail,
  formatTime,
  freeStarts,
  isOpenWeekday,
  type LocalDate,
  ok,
  type Result,
  type RoomNowState,
  roomNow,
  type Span,
  todayAt,
  toFacilityIso,
  type WindowFit,
  windowFit,
  zonedInstant,
} from "@espacios/domain";

import type { FacilityView, RoomCatalog, RoomView } from "../ports/queries/room-catalog";
import type { Dependencies } from "./shared";
import { withRaceHandling } from "./shared";

/**
 * What a company sees of the rooms' time (spec 0008): busy, its own, not available, free. Read inside its tenant
 * transaction so `mine` can only mean its own bookings; nothing says who holds the rest.
 */

type Deps = Pick<Dependencies, "uow" | "clock"> & { readonly rooms: Pick<RoomCatalog, "listRooms" | "findRoom"> };

/** A room as these screens show it: plain values, its sede's hours as `HH:MM`. */
export type AvailabilityRoom = {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly facility: {
    readonly id: string;
    readonly name: string;
    readonly timeZone: string;
    readonly opensAt: string;
    readonly closesAt: string;
    readonly openWeekdays: readonly number[];
  };
};

const toRoom = (room: RoomView): AvailabilityRoom => ({
  id: room.id,
  name: room.name,
  capacity: room.capacity,
  facility: {
    id: room.facility.id,
    name: room.facility.name,
    timeZone: room.facility.timeZone,
    opensAt: formatTime(room.facility.opensAt),
    closesAt: formatTime(room.facility.closesAt),
    openWeekdays: room.facility.openWeekdays,
  },
});

/** One room on one day: its slots, its state now (today only) and, when a window was asked, how it fits. */
export type RoomDay = {
  readonly room: AvailabilityRoom;
  readonly open: boolean;
  readonly slots: readonly DaySlot[];
  readonly now: { readonly state: RoomNowState; readonly until: number | null } | null;
  readonly fit: WindowFit | null;
};

/**
 * Every bookable room on `date`, each read in its sede's zone and hours (spec 0008, AC-1 and AC-3). One read of busy
 * time for every room, whatever their number. A `window` (local minutes) adds each room's fit for it.
 */
export async function getRoomsAvailability(
  deps: Deps,
  actor: Actor,
  input: { readonly date: LocalDate; readonly window?: Span | undefined },
): Promise<Result<{ readonly date: LocalDate; readonly rooms: readonly RoomDay[] }>> {
  const member = authorizeMember(actor);
  if (!member.ok) return member;
  const now = deps.clock.now();

  return withRaceHandling(async () => {
    const rooms = await deps.rooms.listRooms();
    if (rooms.length === 0) return ok({ date: input.date, rooms: [] });
    // The day starts and ends at different instants in each sede's zone: read the span that covers them all.
    const starts = rooms.map((room) => zonedInstant(input.date, 0, room.facility.timeZone).getTime());
    const ends = rooms.map((room) => zonedInstant(addDays(input.date, 1), 0, room.facility.timeZone).getTime());
    const busy = await deps.uow.run(member.value.tenantId, (tx) =>
      tx.availability.busyIntervals(new Date(Math.min(...starts)), new Date(Math.max(...ends))),
    );

    return ok({
      date: input.date,
      rooms: rooms.map((room): RoomDay => {
        const mine = busy.filter((interval) => interval.roomId === room.id);
        const today = todayAt(now, room.facility.timeZone) === input.date;
        return {
          room: toRoom(room),
          open: isOpenWeekday(input.date, room.facility),
          slots: daySlots(input.date, room.facility, mine, now),
          now: today ? roomNow(room.facility, mine, now) : null,
          fit: input.window
            ? windowFit(input.date, room.facility, mine, now, input.window.start, input.window.end)
            : null,
        };
      }),
    });
  });
}

export type RoomAvailability = {
  readonly room: AvailabilityRoom;
  /** Each day of the range: open or closed, with the sede's hours. */
  readonly days: readonly {
    readonly date: LocalDate;
    readonly open: boolean;
    readonly opensAt: string;
    readonly closesAt: string;
  }[];
  /** Busy time overlapping the range, instants with the sede's offset. Never who holds it. */
  readonly busy: readonly {
    readonly startsAt: string;
    readonly endsAt: string;
    readonly kind: BusyKind;
    readonly mine: boolean;
  }[];
};

const DAY_MS = 86_400_000;

/**
 * One room over inclusive local days (spec 0008, AC-2; `GET /api/v1/rooms/{id}/availability`): at most
 * `AVAILABILITY_RANGE_MAX_DAYS`. An unknown or retired room is 404.
 */
export async function getRoomAvailability(
  deps: Deps,
  actor: Actor,
  input: { readonly roomId: string; readonly from: LocalDate; readonly to: LocalDate },
): Promise<Result<RoomAvailability>> {
  const member = authorizeMember(actor);
  if (!member.ok) return member;
  const days = (Date.parse(`${input.to}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / DAY_MS + 1;
  if (!(days >= 1 && days <= AVAILABILITY_RANGE_MAX_DAYS)) return fail("invalid_range");

  return withRaceHandling(async () => {
    const room = await deps.rooms.findRoom(input.roomId);
    if (!room?.active) return fail("not_found");
    const zone = room.facility.timeZone;
    const busy = await deps.uow.run(member.value.tenantId, (tx) =>
      tx.availability.busyIntervals(
        zonedInstant(input.from, 0, zone),
        zonedInstant(addDays(input.to, 1), 0, zone),
        room.id,
      ),
    );
    const view = toRoom(room);
    return ok({
      room: view,
      days: Array.from({ length: days }, (_, index) => {
        const date = addDays(input.from, index);
        return {
          date,
          open: isOpenWeekday(date, room.facility),
          opensAt: view.facility.opensAt,
          closesAt: view.facility.closesAt,
        };
      }),
      busy: busy.map((interval) => ({
        startsAt: toFacilityIso(interval.startsAt, zone),
        endsAt: toFacilityIso(interval.endsAt, zone),
        kind: interval.kind,
        mine: interval.mine,
      })),
    });
  });
}

export type RoomAgenda = {
  readonly room: AvailabilityRoom;
  /** Each day of the range with the starts (local minutes) where `minutes` fit free; none on a closed day. */
  readonly days: readonly { readonly date: LocalDate; readonly open: boolean; readonly starts: readonly number[] }[];
};

/**
 * One room's free starts for a duration over inclusive local days (spec 0008, the room page): a month and its edges at
 * most. One read of busy time for the whole range. An unknown or retired room is 404; a duration off the 30 minute grid
 * or outside the booking limits is `invalid_range`.
 */
export async function getRoomAgenda(
  deps: Deps,
  actor: Actor,
  input: { readonly roomId: string; readonly from: LocalDate; readonly to: LocalDate; readonly minutes: number },
): Promise<Result<RoomAgenda>> {
  const member = authorizeMember(actor);
  if (!member.ok) return member;
  const days = (Date.parse(`${input.to}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / DAY_MS + 1;
  const { minMinutes, maxMinutes, slotMinutes } = BOOKING_RULES;
  const minutesOk = input.minutes >= minMinutes && input.minutes <= maxMinutes && input.minutes % slotMinutes === 0;
  if (!(days >= 1 && days <= AVAILABILITY_RANGE_MAX_DAYS) || !minutesOk) return fail("invalid_range");
  const now = deps.clock.now();

  return withRaceHandling(async () => {
    const room = await deps.rooms.findRoom(input.roomId);
    if (!room?.active) return fail("not_found");
    const zone = room.facility.timeZone;
    const busy = await deps.uow.run(member.value.tenantId, (tx) =>
      tx.availability.busyIntervals(
        zonedInstant(input.from, 0, zone),
        zonedInstant(addDays(input.to, 1), 0, zone),
        room.id,
      ),
    );
    return ok({
      room: toRoom(room),
      days: Array.from({ length: days }, (_, index) => {
        const date = addDays(input.from, index);
        return {
          date,
          open: isOpenWeekday(date, room.facility),
          starts: freeStarts(date, room.facility, busy, now, input.minutes),
        };
      }),
    });
  });
}

/** A room of the booking search: what its card shows and what its rules read. */
export type FacilityMonthRoom = { readonly id: string; readonly name: string; readonly capacity: number };

/**
 * The booking search's data (spec 0008): one sede, its rooms and their busy time over inclusive local days (the month
 * the calendar shows, with its edges). Busy time carries `kind` and `mine` only, never who holds it. The browser reads
 * every start, day and fit from it with the domain's functions, so a filter or a choice never asks the server again.
 */
export type FacilityMonth = {
  readonly facility: FacilityView;
  readonly rooms: readonly FacilityMonthRoom[];
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly busy: readonly (BusyInterval & { readonly roomId: string })[];
};

/**
 * Every bookable room of one sede and their busy time from `from` to `to` (spec 0008, the booking search). One read of
 * busy time, whatever the number of rooms. A sede with no bookable room is 404; a reversed range or one over six weeks
 * is `invalid_range`.
 */
export async function getFacilityMonth(
  deps: Deps,
  actor: Actor,
  input: { readonly facilityId: string; readonly from: LocalDate; readonly to: LocalDate },
): Promise<Result<FacilityMonth>> {
  const member = authorizeMember(actor);
  if (!member.ok) return member;
  const days = (Date.parse(`${input.to}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / DAY_MS + 1;
  if (!(days >= 1 && days <= AVAILABILITY_RANGE_MAX_DAYS)) return fail("invalid_range");

  return withRaceHandling(async () => {
    const rooms = (await deps.rooms.listRooms()).filter((room) => room.facility.id === input.facilityId);
    const facility = rooms[0]?.facility;
    if (!facility) return fail("not_found");
    const zone = facility.timeZone;
    const ids = new Set(rooms.map((room) => room.id));
    const busy = await deps.uow.run(member.value.tenantId, (tx) =>
      tx.availability.busyIntervals(zonedInstant(input.from, 0, zone), zonedInstant(addDays(input.to, 1), 0, zone)),
    );
    return ok({
      facility,
      rooms: rooms.map((room) => ({ id: room.id, name: room.name, capacity: room.capacity })),
      from: input.from,
      to: input.to,
      busy: busy.filter((interval) => ids.has(interval.roomId)),
    });
  });
}
