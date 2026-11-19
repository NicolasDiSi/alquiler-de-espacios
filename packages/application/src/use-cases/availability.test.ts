import {
  type Actor,
  type BusyInterval,
  type LocalDate,
  type TenantId,
  type UserId,
  zonedInstant,
} from "@espacios/domain";
import { describe, expect, it } from "vitest";

import { BusyError, type TenantTransaction, type UnitOfWork } from "../ports/ports";
import type { FacilityView, RoomView } from "../ports/queries/room-catalog";
import { getFacilityMonth, getRoomAgenda, getRoomAvailability, getRoomsAvailability } from "./availability";

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";
const at = (date: string, hours: number, minutes = 0) =>
  zonedInstant(date as LocalDate, hours * 60 + minutes, BUENOS_AIRES);

const ACME = "company-acme" as TenantId;
const ana: Actor = { role: "member", userId: "user-ana" as UserId, tenantId: ACME };
const operator: Actor = { role: "operator", userId: "user-operador" as UserId };

// Monday 2030-01-14 is open; Saturday 2030-01-19 is closed. The clock reads 10:00 that Monday in Buenos Aires.
const MONDAY = "2030-01-14" as LocalDate;
const SATURDAY = "2030-01-19" as LocalDate;
const now = at(MONDAY, 10);

const CENTRAL: FacilityView = {
  id: "facility-central",
  name: "Sede Central",
  timeZone: BUENOS_AIRES,
  opensAt: 8 * 60,
  closesAt: 20 * 60,
  openWeekdays: [1, 2, 3, 4, 5],
};
const NORTE_SEDE: FacilityView = { ...CENTRAL, id: "facility-norte", name: "Sede Norte" };
const NORTE: RoomView = { id: "room-norte", name: "Sala Norte", capacity: 8, active: true, facility: CENTRAL };
const SUR: RoomView = { id: "room-sur", name: "Sala Sur", capacity: 4, active: true, facility: NORTE_SEDE };
const RETIRED: RoomView = { ...NORTE, id: "room-retired", active: false };

type Busy = BusyInterval & { readonly roomId: string };
// Another company's booking 11:00 to 12:00, Acme's own 14:00 to 15:00 and a block 16:00 to 17:00 in Sala Norte.
const BUSY: readonly Busy[] = [
  { roomId: NORTE.id, startsAt: at(MONDAY, 11), endsAt: at(MONDAY, 12), kind: "booked", mine: false },
  { roomId: NORTE.id, startsAt: at(MONDAY, 14), endsAt: at(MONDAY, 15), kind: "booked", mine: true },
  { roomId: NORTE.id, startsAt: at(MONDAY, 16), endsAt: at(MONDAY, 17), kind: "blocked", mine: false },
  { roomId: SUR.id, startsAt: at(MONDAY, 9), endsAt: at(MONDAY, 10), kind: "booked", mine: false },
];

/** Fake ports that record each read: the tenant of the transaction and the range asked for busy time. */
function setup(options: { rooms?: readonly RoomView[]; busyError?: boolean } = {}) {
  const rooms = options.rooms ?? [NORTE, SUR];
  const reads: { tenantId: TenantId; from: Date; to: Date; roomId: string | undefined }[] = [];
  const tx = (tenantId: TenantId) =>
    ({
      availability: {
        busyIntervals: async (from: Date, to: Date, roomId?: string) => {
          reads.push({ tenantId, from, to, roomId });
          if (options.busyError) throw new BusyError();
          return BUSY.filter(
            (interval) => (!roomId || interval.roomId === roomId) && interval.startsAt < to && interval.endsAt > from,
          );
        },
      },
    }) as unknown as TenantTransaction;
  const uow: UnitOfWork = { run: (tenantId, work) => work(tx(tenantId)) };
  const deps = {
    uow,
    clock: { now: () => now },
    rooms: {
      listRooms: async () => rooms.filter((room) => room.active),
      findRoom: async (id: string) => rooms.find((room) => room.id === id) ?? null,
    },
  };
  return { deps, reads };
}

const minutes = (hours: number, mins = 0) => hours * 60 + mins;

describe("getRoomsAvailability (spec 0008, AC-1 and AC-3)", () => {
  it("is for members only: the operator is forbidden and nothing is read", async () => {
    const { deps, reads } = setup();
    expect(await getRoomsAvailability(deps, operator, { date: MONDAY })).toEqual({ ok: false, reason: "forbidden" });
    expect(reads).toHaveLength(0);
  });

  it("reads every room's busy time once, inside the member's tenant", async () => {
    const { deps, reads } = setup();
    const result = await getRoomsAvailability(deps, ana, { date: MONDAY });
    expect(result.ok).toBe(true);
    expect(reads).toEqual([{ tenantId: ACME, from: at(MONDAY, 0), to: at("2030-01-15", 0), roomId: undefined }]);
  });

  it("marks each slot as past, free, booked, mine or blocked, and says how the room is now", async () => {
    const { deps } = setup();
    const result = await getRoomsAvailability(deps, ana, { date: MONDAY });
    if (!result.ok) throw new Error(result.reason);
    const norte = result.value.rooms.find((day) => day.room.id === NORTE.id);
    const state = (start: number) => norte?.slots.find((slot) => slot.start === start)?.state;

    expect(norte?.room.facility).toMatchObject({ opensAt: "08:00", closesAt: "20:00" });
    expect(norte?.open).toBe(true);
    expect(state(minutes(9, 30))).toBe("past");
    expect(state(minutes(10))).toBe("free");
    expect(state(minutes(11))).toBe("booked");
    expect(state(minutes(14))).toBe("mine");
    expect(state(minutes(16))).toBe("blocked");
    expect(norte?.now).toEqual({ state: "free", until: minutes(11) });
    expect(norte?.fit).toBeNull();
  });

  it("shows a closed day with no slots and no state now", async () => {
    const { deps } = setup();
    const result = await getRoomsAvailability(deps, ana, { date: SATURDAY });
    if (!result.ok) throw new Error(result.reason);
    for (const day of result.value.rooms) {
      expect(day.open).toBe(false);
      expect(day.slots).toEqual([]);
      expect(day.now).toBeNull();
    }
  });

  it("adds each room's fit when a window is asked", async () => {
    const { deps } = setup();
    const result = await getRoomsAvailability(deps, ana, {
      date: MONDAY,
      window: { start: minutes(11), end: minutes(12) },
    });
    if (!result.ok) throw new Error(result.reason);
    const fit = (id: string) => result.value.rooms.find((day) => day.room.id === id)?.fit?.state;
    expect(fit(NORTE.id)).toBe("conflict");
    expect(fit(SUR.id)).toBe("free");
  });

  it("answers an empty list without reading busy time when no room takes bookings", async () => {
    const { deps, reads } = setup({ rooms: [RETIRED] });
    expect(await getRoomsAvailability(deps, ana, { date: MONDAY })).toEqual({
      ok: true,
      value: { date: MONDAY, rooms: [] },
    });
    expect(reads).toHaveLength(0);
  });

  it("turns a busy database into busy", async () => {
    const { deps } = setup({ busyError: true });
    expect(await getRoomsAvailability(deps, ana, { date: MONDAY })).toEqual({ ok: false, reason: "busy" });
  });
});

describe("getRoomAvailability (spec 0008, AC-2)", () => {
  it("refuses a reversed range and one over 42 days", async () => {
    const { deps, reads } = setup();
    const reversed = await getRoomAvailability(deps, ana, {
      roomId: NORTE.id,
      from: MONDAY,
      to: "2030-01-13" as never,
    });
    const long = await getRoomAvailability(deps, ana, { roomId: NORTE.id, from: MONDAY, to: "2030-02-25" as never });
    expect(reversed).toEqual({ ok: false, reason: "invalid_range" });
    expect(long).toEqual({ ok: false, reason: "invalid_range" });
    expect(reads).toHaveLength(0);
  });

  it("is not_found for an unknown or retired room", async () => {
    const { deps } = setup({ rooms: [NORTE, RETIRED] });
    for (const roomId of ["room-unknown", RETIRED.id]) {
      expect(await getRoomAvailability(deps, ana, { roomId, from: MONDAY, to: MONDAY })).toEqual({
        ok: false,
        reason: "not_found",
      });
    }
  });

  it("lists each day open or closed and only that room's busy time, with the sede's offset and no holder", async () => {
    const { deps, reads } = setup();
    const result = await getRoomAvailability(deps, ana, { roomId: NORTE.id, from: MONDAY, to: SATURDAY });
    if (!result.ok) throw new Error(result.reason);

    expect(result.value.days.map((day) => day.open)).toEqual([true, true, true, true, true, false]);
    expect(reads).toEqual([{ tenantId: ACME, from: at(MONDAY, 0), to: at("2030-01-20", 0), roomId: NORTE.id }]);
    expect(result.value.busy).toHaveLength(3);
    const first = result.value.busy[0];
    expect(first?.startsAt).toMatch(/^2030-01-14T11:00(:00)?(\.000)?-03:00$/);
    expect(Object.keys(first ?? {}).sort()).toEqual(["endsAt", "kind", "mine", "startsAt"]);
  });
});

describe("getRoomAgenda (spec 0008, the room page)", () => {
  it("refuses a duration off the grid or outside the booking limits", async () => {
    const { deps } = setup();
    for (const duration of [45, 0, 5 * 60]) {
      expect(await getRoomAgenda(deps, ana, { roomId: NORTE.id, from: MONDAY, to: MONDAY, minutes: duration })).toEqual(
        { ok: false, reason: "invalid_range" },
      );
    }
  });

  it("is not_found for a retired room", async () => {
    const { deps } = setup({ rooms: [RETIRED] });
    expect(await getRoomAgenda(deps, ana, { roomId: RETIRED.id, from: MONDAY, to: MONDAY, minutes: 60 })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("offers only the starts where the duration fits free, from now on, and none on a closed day", async () => {
    const { deps } = setup();
    const result = await getRoomAgenda(deps, ana, { roomId: NORTE.id, from: MONDAY, to: SATURDAY, minutes: 60 });
    if (!result.ok) throw new Error(result.reason);
    const monday = result.value.days[0]?.starts ?? [];

    expect(monday).toContain(minutes(10));
    expect(monday).toContain(minutes(12));
    for (const taken of [minutes(9, 30), minutes(10, 30), minutes(11), minutes(14), minutes(16)]) {
      expect(monday).not.toContain(taken);
    }
    expect(result.value.days.at(-1)).toEqual({ date: SATURDAY, open: false, starts: [] });
  });
});

describe("getFacilityMonth (spec 0008, the booking search)", () => {
  it("returns one sede's rooms and only their busy time", async () => {
    const { deps } = setup();
    const result = await getFacilityMonth(deps, ana, { facilityId: CENTRAL.id, from: MONDAY, to: SATURDAY });
    if (!result.ok) throw new Error(result.reason);

    expect(result.value.facility).toEqual(CENTRAL);
    expect(result.value.rooms).toEqual([{ id: NORTE.id, name: NORTE.name, capacity: NORTE.capacity }]);
    expect(result.value.busy.every((interval) => interval.roomId === NORTE.id)).toBe(true);
    expect(result.value.busy).toHaveLength(3);
  });

  it("is not_found for a sede with no bookable room and invalid_range for a reversed range", async () => {
    const { deps } = setup();
    expect(await getFacilityMonth(deps, ana, { facilityId: "facility-x", from: MONDAY, to: MONDAY })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await getFacilityMonth(deps, ana, { facilityId: CENTRAL.id, from: SATURDAY, to: MONDAY })).toEqual({
      ok: false,
      reason: "invalid_range",
    });
  });

  it("is for members only", async () => {
    const { deps } = setup();
    expect(await getFacilityMonth(deps, operator, { facilityId: CENTRAL.id, from: MONDAY, to: MONDAY })).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });
});
