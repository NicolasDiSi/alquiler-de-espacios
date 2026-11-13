import type { Actor, AffectedBooking, UserId } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import type {
  BlockRecord,
  BookingScope,
  ClientRecord,
  FacilityRecord,
  MemberRecord,
  OperatorCatalog,
  OperatorCatalogTransaction,
  RoomRecord,
} from "../ports/operator-catalog";
import { UniqueViolationError } from "../ports/ports";
import {
  AFFECTED_BOOKINGS_LIMIT,
  addMember,
  createBlock,
  createClient,
  createFacility,
  createRoom,
  deactivateClient,
  deactivateFacility,
  deactivateRoom,
  getBlock,
  getClient,
  getFacility,
  getRoom,
  listBlocks,
  listClients,
  listFacilities,
  listMembers,
  listRooms,
  reactivateClient,
  releaseBlock,
  updateClient,
  updateFacility,
  updateRoom,
} from "./operator-catalog";

const operator: Actor = { role: "operator", userId: "user-operador" as UserId };
const member: Actor = { role: "member", userId: "user-ana" as UserId, tenantId: "company-acme" as never };
const NOW = new Date("2030-01-07T12:00:00Z");
const hours = { timeZone: "UTC", opensAt: 480, closesAt: 1200, openWeekdays: [1, 2, 3] };

/** An in memory catalog, enough to run the rules. The real one is proven against Postgres in `packages/db`. */
function setup() {
  const facilities = new Map<string, FacilityRecord>();
  const rooms = new Map<string, RoomRecord>();
  const clients = new Map<string, ClientRecord>();
  const members = new Map<string, MemberRecord[]>();
  const blocks = new Map<string, BlockRecord>();
  const created = new Date("2030-01-01T00:00:00Z");
  const taken = new Set<string>();
  const unique = (key: string) => {
    if (taken.has(key)) throw new UniqueViolationError();
    taken.add(key);
  };
  /** Confirmed bookings the tests plant; the real queries are proven against Postgres in `packages/db`. */
  const bookings: AffectedBooking[] = [];
  const inScope = (scope: BookingScope) => (b: AffectedBooking) =>
    "roomId" in scope ? b.roomId === scope.roomId : rooms.get(b.roomId)?.facilityId === scope.facilityId;
  const base: Omit<OperatorCatalog, "transaction"> = {
    listFacilities: async () => [...facilities.values()],
    findFacility: async (id) => facilities.get(id) ?? null,
    insertFacility: async (f) => {
      unique(`facility:${f.name}`);
      const row = { ...f, createdAt: created, deactivatedAt: null };
      facilities.set(f.id, row);
      return row;
    },
    updateFacility: async (id, patch) => {
      const current = facilities.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      facilities.set(id, next);
      return next;
    },
    listRooms: async () => [...rooms.values()],
    findRoom: async (id) => rooms.get(id) ?? null,
    insertRoom: async (r) => {
      const row = { ...r, deactivatedAt: null, createdAt: created };
      rooms.set(r.id, row);
      return row;
    },
    updateRoom: async (id, patch) => {
      const current = rooms.get(id);
      return current ? { ...current, ...patch } : null;
    },
    listClients: async () => [...clients.values()],
    findClient: async (id) => clients.get(id) ?? null,
    insertClient: async (c, m) => {
      unique(`client:${c.slug}`);
      const client = { ...c, createdAt: created, deactivatedAt: null };
      const member = { ...m, createdAt: created };
      clients.set(c.id, client);
      members.set(c.id, [member]);
      return { client, member };
    },
    updateClient: async (id) => clients.get(id) ?? null,
    listMembers: async (id) => members.get(id) ?? [],
    insertMember: async (id, m) => {
      const member = { ...m, createdAt: created };
      members.set(id, [...(members.get(id) ?? []), member]);
      return member;
    },
    listBlocks: async () => [...blocks.values()],
    findBlock: async (id) => blocks.get(id) ?? null,
    insertBlock: async (b) => {
      const row = { ...b, createdAt: created, releasedAt: null };
      blocks.set(b.id, row);
      return row;
    },
    releaseBlock: async (id, at) => {
      const current = blocks.get(id);
      if (!current) return null;
      const next = { ...current, releasedAt: at };
      blocks.set(id, next);
      return next;
    },
  };
  const tx: OperatorCatalogTransaction = {
    ...base,
    lockFacility: async (id) => facilities.get(id) ?? null,
    lockRoom: async (id) => rooms.get(id) ?? null,
    lockClient: async (id) => clients.get(id) ?? null,
    futureBookings: async (scope, after) => bookings.filter(inScope(scope)).filter((b) => b.startsAt > after),
    overlappingBookings: async (scope, startsAt, endsAt) =>
      bookings.filter(inScope(scope)).filter((b) => b.startsAt < endsAt && b.endsAt > startsAt),
    overlappingBlocks: async (target, startsAt, endsAt) =>
      [...blocks.values()].filter(
        (b) =>
          b.facilityId === target.facilityId &&
          !b.releasedAt &&
          b.startsAt < endsAt &&
          b.endsAt > startsAt &&
          (target.roomId === null || b.roomId === null || b.roomId === target.roomId),
      ),
    countActiveRooms: async (facilityId) =>
      [...rooms.values()].filter((r) => r.facilityId === facilityId && !r.deactivatedAt).length,
    setFacilityDeactivation: async (id, at) => {
      const row = facilities.get(id);
      if (!row) return null;
      const next = { ...row, deactivatedAt: at };
      facilities.set(id, next);
      return next;
    },
    setRoomDeactivation: async (id, at) => {
      const row = rooms.get(id);
      if (!row) return null;
      const next = { ...row, deactivatedAt: at };
      rooms.set(id, next);
      return next;
    },
    setClientDeactivation: async (id, at) => {
      const row = clients.get(id);
      if (!row) return null;
      const next = { ...row, deactivatedAt: at };
      clients.set(id, next);
      return next;
    },
  };
  const catalog: OperatorCatalog = { ...base, transaction: (work) => work(tx) };
  let sequence = 0;
  return {
    deps: { catalog, clock: { now: () => NOW }, ids: { next: () => `id-${++sequence}` } },
    facilities,
    rooms,
    clients,
    bookings,
  };
}

const facilityInput = { name: "Sede Norte", address: null, ...hours };

describe("operator use cases (spec 0004)", () => {
  it("refuse a member and no one else gets in, for a read and for a write", async () => {
    const { deps } = setup();
    await expect(listFacilities(deps, member, false)).resolves.toEqual({ ok: false, reason: "forbidden" });
    await expect(createFacility(deps, member, facilityInput)).resolves.toEqual({ ok: false, reason: "forbidden" });
    await expect(listFacilities(deps, operator, false)).resolves.toMatchObject({ ok: true });
  });

  it("validates facility rules on create and on edit, and maps a taken name to already_exists", async () => {
    const { deps } = setup();
    const bad = await createFacility(deps, operator, { ...facilityInput, timeZone: "Mars/Olympus" });
    expect(bad).toEqual({ ok: false, reason: "invalid_input" });

    const created = await createFacility(deps, operator, facilityInput);
    expect(created).toMatchObject({ ok: true });
    await expect(createFacility(deps, operator, facilityInput)).resolves.toEqual({
      ok: false,
      reason: "already_exists",
    });
    const id = created.ok ? created.value.id : "";
    await expect(updateFacility(deps, operator, id, { closesAt: 400 })).resolves.toEqual({
      ok: false,
      reason: "invalid_input",
    });
    await expect(updateFacility(deps, operator, "nope", { address: "x" })).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("creates a room in an active facility only, with its window starting now unless backfilled", async () => {
    const { deps, facilities } = setup();
    await expect(createRoom(deps, operator, { facilityId: "nope", name: "S", capacity: 4 })).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    const site = await createFacility(deps, operator, facilityInput);
    const facilityId = site.ok ? site.value.id : "";

    const room = await createRoom(deps, operator, { facilityId, name: "S", capacity: 4 });
    expect(room).toMatchObject({ ok: true, value: { activeFrom: NOW } });
    const early = new Date("2029-06-01T00:00:00Z");
    await expect(
      createRoom(deps, operator, { facilityId, name: "T", capacity: 4, activeFrom: early }),
    ).resolves.toMatchObject({ ok: true, value: { activeFrom: early } });
    await expect(createRoom(deps, operator, { facilityId, name: "U", capacity: 0 })).resolves.toEqual({
      ok: false,
      reason: "invalid_input",
    });

    const current = facilities.get(facilityId) as FacilityRecord;
    facilities.set(facilityId, { ...current, deactivatedAt: NOW });
    await expect(createRoom(deps, operator, { facilityId, name: "V", capacity: 4 })).resolves.toEqual({
      ok: false,
      reason: "facility_inactive",
    });
  });

  it("gives an individual one member and a company as many as needed (AC-21)", async () => {
    const { deps } = setup();
    const person = await createClient(deps, operator, {
      name: "Juan",
      slug: "juan",
      kind: "individual",
      logoUrl: null,
    });
    expect(person).toMatchObject({ ok: true, value: { member: { name: "Juan" } } });
    const personId = person.ok ? person.value.client.id : "";
    await expect(addMember(deps, operator, personId, "Otra")).resolves.toEqual({
      ok: false,
      reason: "individual_is_single",
    });

    // A company must name its first member, and then takes more.
    await expect(
      createClient(deps, operator, { name: "Acme", slug: "acme", kind: "company", logoUrl: null }),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });
    const company = await createClient(deps, operator, {
      name: "Acme",
      slug: "acme",
      kind: "company",
      logoUrl: null,
      memberName: "Ana",
    });
    const companyId = company.ok ? company.value.client.id : "";
    await expect(addMember(deps, operator, companyId, "Beto")).resolves.toMatchObject({ ok: true });
    await expect(addMember(deps, operator, "nope", "Beto")).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("checks a block's range, facility and room, and releases it once", async () => {
    const { deps } = setup();
    const site = await createFacility(deps, operator, facilityInput);
    const facilityId = site.ok ? site.value.id : "";
    const base = { facilityId, roomId: null, reason: "feriado" };
    const day = (hour: number) => new Date(`2030-01-08T${String(hour).padStart(2, "0")}:00:00Z`);

    await expect(createBlock(deps, operator, { ...base, startsAt: day(12), endsAt: day(10) })).resolves.toEqual({
      ok: false,
      reason: "invalid_range",
    });
    const past = { startsAt: new Date("2030-01-06T09:00:00Z"), endsAt: new Date("2030-01-06T10:00:00Z") };
    await expect(createBlock(deps, operator, { ...base, ...past })).resolves.toEqual({
      ok: false,
      reason: "past_date",
    });
    await expect(
      createBlock(deps, operator, { ...base, facilityId: "nope", startsAt: day(9), endsAt: day(10) }),
    ).resolves.toEqual({ ok: false, reason: "not_found" });

    const block = await createBlock(deps, operator, { ...base, startsAt: day(9), endsAt: day(10) });
    expect(block).toMatchObject({ ok: true, value: { createdBy: "user-operador" } });
    const id = block.ok ? block.value.id : "";
    await expect(releaseBlock(deps, operator, id)).resolves.toMatchObject({ ok: true, value: { releasedAt: NOW } });
    await expect(releaseBlock(deps, operator, id)).resolves.toEqual({ ok: false, reason: "already_released" });
  });

  it("reads, lists and edits every resource, and says not_found for what is not there", async () => {
    const { deps } = setup();
    const site = await createFacility(deps, operator, facilityInput);
    const facilityId = site.ok ? site.value.id : "";
    const room = await createRoom(deps, operator, { facilityId, name: "S", capacity: 4 });
    const roomId = room.ok ? room.value.id : "";
    const client = await createClient(deps, operator, {
      name: "Acme",
      slug: "acme",
      kind: "company",
      logoUrl: null,
      memberName: "Ana",
    });
    const clientId = client.ok ? client.value.client.id : "";
    const block = await createBlock(deps, operator, {
      facilityId,
      roomId: null,
      reason: "obra",
      startsAt: new Date("2030-01-08T09:00:00Z"),
      endsAt: new Date("2030-01-08T10:00:00Z"),
    });
    const blockId = block.ok ? block.value.id : "";

    for (const result of [
      await getFacility(deps, operator, facilityId),
      await getRoom(deps, operator, roomId),
      await getClient(deps, operator, clientId),
      await getBlock(deps, operator, blockId),
      await listRooms(deps, operator, { includeInactive: false }),
      await listClients(deps, operator, false),
      await listMembers(deps, operator, clientId),
      await listBlocks(deps, operator, { includeReleased: false }),
      await updateRoom(deps, operator, roomId, { capacity: 8 }),
      await updateClient(deps, operator, clientId, { name: "Acme SA" }),
    ]) {
      expect(result.ok).toBe(true);
    }
    await expect(updateRoom(deps, operator, roomId, { capacity: 0 })).resolves.toEqual({
      ok: false,
      reason: "invalid_input",
    });
    for (const result of [
      await getFacility(deps, operator, "nope"),
      await getRoom(deps, operator, "nope"),
      await getClient(deps, operator, "nope"),
      await getBlock(deps, operator, "nope"),
      await listMembers(deps, operator, "nope"),
      await releaseBlock(deps, operator, "nope"),
    ]) {
      expect(result).toEqual({ ok: false, reason: "not_found" });
    }
  });
});

describe("deactivation, hours change and block refusals (spec 0004, AC-5, AC-6, AC-7, AC-18)", () => {
  const monday = (hour: number, minute = 0) => new Date(Date.UTC(2030, 0, 14, hour, minute)); // a Monday, UTC
  const booking = (roomId: string, startsAt: Date, endsAt: Date, id = `b-${startsAt.getTime()}`): AffectedBooking => ({
    id,
    roomId,
    roomName: "Sala 1",
    companyId: "acme",
    companyName: "Acme",
    startsAt,
    endsAt,
  });

  async function site() {
    const world = setup();
    const facility = await createFacility(world.deps, operator, facilityInput);
    const facilityId = facility.ok ? facility.value.id : "";
    const room = await createRoom(world.deps, operator, { facilityId, name: "Sala 1", capacity: 4 });
    const roomId = room.ok ? room.value.id : "";
    return { ...world, facilityId, roomId };
  }

  it("deactivates a room with no future booking at the clock's now, and says the same the second time", async () => {
    const { deps, roomId, bookings } = await site();
    bookings.push(booking(roomId, new Date("2030-01-07T09:00:00Z"), new Date("2030-01-07T10:00:00Z"))); // already started
    const first = await deactivateRoom(deps, operator, roomId);
    expect(first).toMatchObject({ ok: true, value: { id: roomId, deactivatedAt: NOW } });
    await expect(deactivateRoom(deps, operator, roomId)).resolves.toEqual(first);
    await expect(deactivateRoom(deps, operator, "nope")).resolves.toEqual({ ok: false, reason: "not_found" });
    await expect(deactivateRoom(deps, member, roomId)).resolves.toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses to deactivate a room with future bookings and lists them, and works once they are gone (AC-5)", async () => {
    const { deps, roomId, rooms, bookings } = await site();
    const future = booking(roomId, monday(9), monday(10));
    bookings.push(future);
    const refused = await deactivateRoom(deps, operator, roomId);
    expect(refused).toEqual({ ok: false, reason: "has_future_bookings", details: { total: 1, bookings: [future] } });
    expect(rooms.get(roomId)?.deactivatedAt).toBeNull();

    bookings.length = 0;
    await expect(deactivateRoom(deps, operator, roomId)).resolves.toMatchObject({ ok: true });
  });

  it("lists at most 50 bookings and counts all of them", async () => {
    const { deps, roomId, bookings } = await site();
    for (let i = 0; i < AFFECTED_BOOKINGS_LIMIT + 5; i++) {
      bookings.push(
        booking(
          roomId,
          new Date(monday(9).getTime() + i * 86_400_000),
          new Date(monday(10).getTime() + i * 86_400_000),
        ),
      );
    }
    const refused = await deactivateRoom(deps, operator, roomId);
    expect(refused.ok === false && refused.details?.total).toBe(AFFECTED_BOOKINGS_LIMIT + 5);
    expect(refused.ok === false && refused.details?.bookings).toHaveLength(AFFECTED_BOOKINGS_LIMIT);
  });

  it("deactivates a facility only when none of its rooms is active (AC-5)", async () => {
    const { deps, facilityId, roomId } = await site();
    await expect(deactivateFacility(deps, operator, facilityId)).resolves.toEqual({
      ok: false,
      reason: "facility_has_active_rooms",
    });
    await deactivateRoom(deps, operator, roomId);
    const done = await deactivateFacility(deps, operator, facilityId);
    expect(done).toMatchObject({ ok: true, value: { deactivatedAt: NOW } });
    await expect(deactivateFacility(deps, operator, facilityId)).resolves.toEqual(done);
    await expect(deactivateFacility(deps, operator, "nope")).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("deactivates and reactivates a client without touching what it owns (AC-7)", async () => {
    const { deps, clients } = setup();
    const created = await createClient(deps, operator, {
      name: "Acme",
      slug: "acme",
      kind: "company",
      logoUrl: null,
      memberName: "Ana",
    });
    const id = created.ok ? created.value.client.id : "";
    await expect(reactivateClient(deps, operator, id)).resolves.toMatchObject({
      ok: true,
      value: { deactivatedAt: null },
    });
    const off = await deactivateClient(deps, operator, id);
    expect(off).toMatchObject({ ok: true, value: { deactivatedAt: NOW } });
    await expect(deactivateClient(deps, operator, id)).resolves.toEqual(off);
    expect(clients.get(id)?.deactivatedAt).toEqual(NOW);
    await expect(reactivateClient(deps, operator, id)).resolves.toMatchObject({
      ok: true,
      value: { deactivatedAt: null },
    });
    await expect(deactivateClient(deps, operator, "nope")).resolves.toEqual({ ok: false, reason: "not_found" });
    await expect(reactivateClient(deps, operator, "nope")).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("refuses an hours change that strands a future booking, listing only those, and lets the rest through (AC-6)", async () => {
    const { deps, facilityId, roomId, facilities, bookings } = await site();
    const late = booking(roomId, monday(18), monday(19), "late");
    bookings.push(booking(roomId, monday(9), monday(10), "morning"), late);

    const refused = await updateFacility(deps, operator, facilityId, { closesAt: 17 * 60 });
    expect(refused).toEqual({ ok: false, reason: "has_future_bookings", details: { total: 1, bookings: [late] } });
    expect(facilities.get(facilityId)?.closesAt).toBe(1200);

    // Weekdays too: Monday is booked, so closing Mondays is refused; opening Fridays as well is fine.
    await expect(updateFacility(deps, operator, facilityId, { openWeekdays: [2, 3] })).resolves.toMatchObject({
      ok: false,
      reason: "has_future_bookings",
    });
    await expect(updateFacility(deps, operator, facilityId, { openWeekdays: [1, 2, 3, 5] })).resolves.toMatchObject({
      ok: true,
    });
    // A change that is not about booking rules never looks at bookings.
    await expect(updateFacility(deps, operator, facilityId, { address: "Calle 1" })).resolves.toMatchObject({
      ok: true,
    });
  });

  it("refuses a block over confirmed bookings and lists them; a room scope ignores other rooms (AC-18)", async () => {
    const { deps, facilityId, roomId, bookings } = await site();
    const other = await createRoom(deps, operator, { facilityId, name: "Sala 2", capacity: 2 });
    const otherId = other.ok ? other.value.id : "";
    const inRoom = booking(roomId, monday(9), monday(10), "in-room");
    const inOther = booking(otherId, monday(11), monday(12), "in-other");
    bookings.push(inRoom, inOther);
    const range = { startsAt: monday(8), endsAt: monday(13), reason: "obra" };

    await expect(createBlock(deps, operator, { facilityId, roomId, ...range })).resolves.toEqual({
      ok: false,
      reason: "block_has_bookings",
      details: { total: 1, bookings: [inRoom] },
    });
    await expect(createBlock(deps, operator, { facilityId, roomId: null, ...range })).resolves.toMatchObject({
      ok: false,
      reason: "block_has_bookings",
      details: { total: 2 },
    });
    // Touching ends do not overlap: a block that starts when the booking ends is fine.
    await expect(
      createBlock(deps, operator, { facilityId, roomId, startsAt: monday(10), endsAt: monday(12), reason: "obra" }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("refuses a block over another block of the room or of the sede, and takes it once that one is released", async () => {
    const { deps, facilityId, roomId } = await site();
    const first = await createBlock(deps, operator, {
      facilityId,
      roomId,
      startsAt: monday(9),
      endsAt: monday(11),
      reason: "a",
    });
    const id = first.ok ? first.value.id : "";
    const again = { facilityId, startsAt: monday(10), endsAt: monday(12), reason: "b" };

    await expect(createBlock(deps, operator, { ...again, roomId })).resolves.toEqual({
      ok: false,
      reason: "block_overlaps_block",
    });
    // The whole sede overlaps the room's block too.
    await expect(createBlock(deps, operator, { ...again, roomId: null })).resolves.toEqual({
      ok: false,
      reason: "block_overlaps_block",
    });
    await releaseBlock(deps, operator, id);
    await expect(createBlock(deps, operator, { ...again, roomId })).resolves.toMatchObject({ ok: true });
  });
});
