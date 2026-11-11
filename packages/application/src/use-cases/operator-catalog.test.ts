import type { Actor, UserId } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import type {
  BlockRecord,
  ClientRecord,
  FacilityRecord,
  MemberRecord,
  OperatorCatalog,
  RoomRecord,
} from "../ports/operator-catalog";
import { UniqueViolationError } from "../ports/ports";
import {
  addMember,
  createBlock,
  createClient,
  createFacility,
  createRoom,
  getBlock,
  getClient,
  getFacility,
  getRoom,
  listBlocks,
  listClients,
  listFacilities,
  listMembers,
  listRooms,
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
  const catalog: OperatorCatalog = {
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
  let sequence = 0;
  return { deps: { catalog, clock: { now: () => NOW }, ids: { next: () => `id-${++sequence}` } }, facilities };
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
