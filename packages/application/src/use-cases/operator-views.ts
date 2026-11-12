import {
  addDays,
  type BlockPhase,
  blockPhase,
  formatTime,
  localDateOf,
  localMinutesOf,
  toFacilityIso,
  weekdayOf,
  zonedInstant,
} from "@espacios/domain";

import type {
  BlockRecord,
  ClientKind,
  ClientRecord,
  FacilityRecord,
  MemberRecord,
  RoomRecord,
} from "../ports/operator-catalog";

/**
 * What the operator screens show (spec 0005), shaped for the screen and safe to hand a Client Component: plain values,
 * instants as RFC 3339 in the sede's zone (as `BookingView`), never a record. Every list carries inactive rows too and
 * says so in `status`; the screen filters them.
 */

export type RecordStatus = "active" | "inactive";
const statusOf = (deactivatedAt: Date | null): RecordStatus => (deactivatedAt ? "inactive" : "active");

/** Minutes from midnight as `HH:mm`, with `1440` as `24:00` (a sede may close at midnight). */
const mark = (minutes: number) => (minutes === 1440 ? "24:00" : formatTime(minutes));

/** Monday first, the order the screens show. */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

export type OperatorFacilityView = {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly timeZone: string;
  readonly opensAt: string;
  readonly closesAt: string;
  /** 0 Sunday to 6 Saturday, ordered Monday first. */
  readonly openWeekdays: readonly number[];
  readonly activeRooms: number;
  readonly status: RecordStatus;
  readonly deactivatedAt: string | null;
};

export function toOperatorFacilityView(record: FacilityRecord, activeRooms: number): OperatorFacilityView {
  return {
    id: record.id,
    name: record.name,
    address: record.address,
    timeZone: record.timeZone,
    opensAt: mark(record.opensAt),
    closesAt: mark(record.closesAt),
    openWeekdays: MONDAY_FIRST.filter((day) => record.openWeekdays.includes(day)),
    activeRooms,
    status: statusOf(record.deactivatedAt),
    deactivatedAt: record.deactivatedAt ? toFacilityIso(record.deactivatedAt, record.timeZone) : null,
  };
}

/** The sede list: each sede with how many of its rooms are active, counted from one read of every room. */
export function toOperatorFacilityViews(
  facilities: readonly FacilityRecord[],
  rooms: readonly RoomRecord[],
): OperatorFacilityView[] {
  const active = new Map<string, number>();
  for (const room of rooms)
    if (!room.deactivatedAt) active.set(room.facilityId, (active.get(room.facilityId) ?? 0) + 1);
  return facilities.map((facility) => toOperatorFacilityView(facility, active.get(facility.id) ?? 0));
}

export type OperatorRoomView = {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly activeFrom: string;
  readonly status: RecordStatus;
  readonly deactivatedAt: string | null;
};

export function toOperatorRoomView(record: RoomRecord, timeZone: string): OperatorRoomView {
  return {
    id: record.id,
    name: record.name,
    capacity: record.capacity,
    activeFrom: toFacilityIso(record.activeFrom, timeZone),
    status: statusOf(record.deactivatedAt),
    deactivatedAt: record.deactivatedAt ? toFacilityIso(record.deactivatedAt, timeZone) : null,
  };
}

export type OperatorBlockView = {
  readonly id: string;
  /** `null` is the whole sede. */
  readonly room: { readonly id: string; readonly name: string } | null;
  readonly startsAt: string;
  readonly endsAt: string;
  /** Internal; only the operator screens show it. */
  readonly reason: string;
  readonly phase: BlockPhase;
};

/** `rooms` are the sede's rooms, active or not, so a block on a retired room still shows its name. */
export function toOperatorBlockViews(
  blocks: readonly BlockRecord[],
  rooms: readonly RoomRecord[],
  timeZone: string,
  now: Date,
): OperatorBlockView[] {
  const names = new Map(rooms.map((room) => [room.id, room.name]));
  return blocks.map((block) => ({
    id: block.id,
    room: block.roomId ? { id: block.roomId, name: names.get(block.roomId) ?? block.roomId } : null,
    startsAt: toFacilityIso(block.startsAt, timeZone),
    endsAt: toFacilityIso(block.endsAt, timeZone),
    reason: block.reason,
    phase: blockPhase(block, now),
  }));
}

export type OperatorClientView = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly kind: ClientKind;
  readonly logoUrl: string | null;
  readonly status: RecordStatus;
  readonly deactivatedAt: string | null;
};

export function toOperatorClientView(record: ClientRecord): OperatorClientView {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    kind: record.kind,
    logoUrl: record.logoUrl,
    status: statusOf(record.deactivatedAt),
    deactivatedAt: record.deactivatedAt?.toISOString() ?? null,
  };
}

export type OperatorMemberView = { readonly id: string; readonly name: string; readonly createdAt: string };

export const toOperatorMemberView = (record: MemberRecord): OperatorMemberView => ({
  id: record.id,
  name: record.name,
  createdAt: record.createdAt.toISOString(),
});

/** A stretch of one day, in minutes from the sede's midnight (`0` to `1440`). */
export type DayStretch = { readonly from: number; readonly to: number };

export type OperatorWeekDay = {
  /** `YYYY-MM-DD` in the sede's zone. */
  readonly date: string;
  /** 0 Sunday to 6 Saturday. */
  readonly weekday: number;
  /** The opening window, or `null` on a closed day. */
  readonly open: DayStretch | null;
  /** Active blocks on that day, whole sede or one room, cut to the day. */
  readonly blocked: readonly (DayStretch & { readonly room: string | null })[];
  readonly isToday: boolean;
};

export type OperatorWeekView = {
  readonly days: readonly OperatorWeekDay[];
  /** Minutes from the sede's midnight now, to mark the current time on today. */
  readonly nowMinutes: number;
};

/**
 * The current week of a sede, Monday to Sunday in its zone (spec 0005): when it opens each day and what the active
 * blocks take from it. Shaped on the server so the screen only draws it.
 */
export function toOperatorWeekView(
  facility: FacilityRecord,
  blocks: readonly BlockRecord[],
  rooms: readonly RoomRecord[],
  now: Date,
): OperatorWeekView {
  const { timeZone } = facility;
  const today = localDateOf(now, timeZone);
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const names = new Map(rooms.map((room) => [room.id, room.name]));
  const active = blocks.filter((block) => blockPhase(block, now) === "active");

  const days = Array.from({ length: 7 }, (_, index): OperatorWeekDay => {
    const date = addDays(monday, index);
    const weekday = weekdayOf(date);
    const dayStart = zonedInstant(date, 0, timeZone).getTime();
    const dayEnd = zonedInstant(addDays(date, 1), 0, timeZone).getTime();
    const blocked = active
      .filter((block) => block.startsAt.getTime() < dayEnd && block.endsAt.getTime() > dayStart)
      .map((block) => ({
        from: block.startsAt.getTime() <= dayStart ? 0 : localMinutesOf(block.startsAt, timeZone),
        to: block.endsAt.getTime() >= dayEnd ? 1440 : localMinutesOf(block.endsAt, timeZone),
        room: block.roomId ? (names.get(block.roomId) ?? null) : null,
      }));
    return {
      date,
      weekday,
      open: facility.openWeekdays.includes(weekday) ? { from: facility.opensAt, to: facility.closesAt } : null,
      blocked,
      isToday: date === today,
    };
  });
  return { days, nowMinutes: localMinutesOf(now, timeZone) };
}

/** Where a block can go (spec 0007): each active sede with its active rooms, by name, for a dialog outside the sede page. */
export type OperatorBlockTarget = {
  readonly facility: OperatorFacilityView;
  readonly rooms: readonly OperatorRoomView[];
};

export function toOperatorBlockTargets(
  facilities: readonly FacilityRecord[],
  rooms: readonly RoomRecord[],
): OperatorBlockTarget[] {
  const active = rooms.filter((room) => !room.deactivatedAt);
  return toOperatorFacilityViews(
    facilities.filter((facility) => !facility.deactivatedAt),
    active,
  )
    .map((facility) => ({
      facility,
      rooms: active
        .filter((room) => room.facilityId === facility.id)
        .map((room) => toOperatorRoomView(room, facility.timeZone))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.facility.name.localeCompare(b.facility.name));
}
