import {
  createBlock,
  deactivateClient,
  deactivateFacility,
  deactivateRoom,
  MissingReferenceError,
  UniqueViolationError,
  updateFacility,
} from "@espacios/application";
import type { Actor, UserId } from "@espacios/domain";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createPrismaOperatorCatalog } from "./operator-catalog";
import { asTenant, at, createMember, createTenant, RACE_WAITS } from "./testing/fixtures";
import { oneWinner, resultOutcomes } from "./testing/outcomes";

const owner = createDatabaseClient(inject("databaseUrls").ownerUrl);
const operator = createDatabaseClient(inject("databaseUrls").operatorUrl);
// Longer waits for a connection and for the facility lock than in the app: the suites share one container.
const catalog = createPrismaOperatorCatalog(operator, RACE_WAITS);

afterAll(async () => {
  await Promise.all([operator.$disconnect(), owner.$disconnect()]);
});

const unique = () => crypto.randomUUID().slice(0, 8);
const hours = { timeZone: "UTC", opensAt: 480, closesAt: 1200, openWeekdays: [1, 2, 3] };

async function facility() {
  const id = `facility-${unique()}`;
  return catalog.insertFacility({ id, name: id, address: null, ...hours });
}

describe("the operator catalog on the operator login (spec 0004, thin CRUD)", () => {
  it("creates, reads, lists and edits a facility; a taken name is UniqueViolationError", async () => {
    const created = await facility();
    expect(created).toMatchObject({ ...hours, deactivatedAt: null });
    await expect(catalog.findFacility(created.id)).resolves.toMatchObject({ id: created.id });
    expect((await catalog.listFacilities(false)).map((row) => row.id)).toContain(created.id);

    const updated = await catalog.updateFacility(created.id, { openWeekdays: [5], address: "Calle 1" });
    expect(updated).toMatchObject({ openWeekdays: [5], address: "Calle 1", opensAt: 480 });
    await expect(catalog.updateFacility("facility-nope", { address: "x" })).resolves.toBeNull();

    await expect(
      catalog.insertFacility({ id: `facility-${unique()}`, name: created.name, address: null, ...hours }),
    ).rejects.toBeInstanceOf(UniqueViolationError);
  });

  it("keeps a room name unique inside its facility only, and refuses an unknown facility", async () => {
    const [one, two] = [await facility(), await facility()];
    const room = (facilityId: string) => ({
      id: `room-${unique()}`,
      facilityId,
      name: "Sala 1",
      capacity: 4,
      activeFrom: at(0),
    });
    await catalog.insertRoom(room(one.id));
    await expect(catalog.insertRoom(room(two.id))).resolves.toMatchObject({ name: "Sala 1" });
    await expect(catalog.insertRoom(room(one.id))).rejects.toBeInstanceOf(UniqueViolationError);
    await expect(catalog.insertRoom(room("facility-nope"))).rejects.toBeInstanceOf(MissingReferenceError);
    expect((await catalog.listRooms({ facilityId: one.id, includeInactive: false })).length).toBe(1);
  });

  it("creates a client with its first member in one transaction, and adds members", async () => {
    const slug = `cliente-${unique()}`;
    const { client, member } = await catalog.insertClient(
      { id: `company-${slug}`, name: "Juan Perez", slug, kind: "individual", logoUrl: "https://example.com/l.png" },
      { id: `user-${slug}`, name: `user-${slug}` },
    );
    expect(client).toMatchObject({ kind: "individual", logoUrl: "https://example.com/l.png", deactivatedAt: null });
    expect(await catalog.listMembers(client.id)).toEqual([member]);
    await catalog.insertMember(client.id, { id: `user-${slug}-2`, name: `user-${slug}-2` });
    expect((await catalog.listMembers(client.id)).length).toBe(2);

    // A repeated slug fails and the member of that failed attempt is not left behind.
    const otherMember = `user-${slug}-x`;
    await expect(
      catalog.insertClient(
        { id: `company-${unique()}`, name: "Otro", slug, kind: "company", logoUrl: null },
        { id: otherMember, name: otherMember },
      ),
    ).rejects.toBeInstanceOf(UniqueViolationError);
    await expect(operator.appUser.findUnique({ where: { id: otherMember } })).resolves.toBeNull();
  });

  it("creates a block, lists it, and releases it", async () => {
    const site = await facility();
    const client = await catalog.insertClient(
      { id: `company-${unique()}`, name: "C", slug: `c-${unique()}`, kind: "company", logoUrl: null },
      { id: `user-m-${unique()}`, name: `user-m-${unique()}` },
    );
    const block = await catalog.insertBlock({
      id: `block-${unique()}`,
      facilityId: site.id,
      roomId: null,
      startsAt: at(9),
      endsAt: at(12),
      reason: "feriado",
      createdBy: client.member.id,
    });
    expect((await catalog.listBlocks({ facilityId: site.id, includeReleased: false })).map((row) => row.id)).toEqual([
      block.id,
    ]);
    const released = await catalog.releaseBlock(block.id, at(10));
    expect(released?.releasedAt).toEqual(at(10));
    expect(await catalog.listBlocks({ facilityId: site.id, includeReleased: false })).toEqual([]);
    expect(await catalog.listBlocks({ facilityId: site.id, includeReleased: true })).toHaveLength(1);
  });
});

describe("deactivation, hours change and blocks against the real database (spec 0004, AC-5, AC-6, AC-18, P-16)", () => {
  const operatorUserId = `user-operador-${unique()}`;
  const actor: Actor = { role: "operator", userId: operatorUserId as UserId };
  beforeAll(async () => {
    await owner.appUser.create({ data: { id: operatorUserId, name: operatorUserId, role: "operator" } });
  });
  const deps = { catalog, clock: { now: () => at(0) }, ids: { next: () => `id-${crypto.randomUUID()}` } };

  async function world() {
    const site = await facility();
    const room = await catalog.insertRoom({
      id: `room-${unique()}`,
      facilityId: site.id,
      name: "Sala 1",
      capacity: 4,
      activeFrom: at(0),
    });
    const tenantId = await createTenant(owner, "deact");
    const bookedBy = await createMember(owner, tenantId);
    const book = async (startsAt: Date, endsAt: Date) => {
      const id = `b-${unique()}`;
      await asTenant(owner, tenantId, (tx) =>
        tx.booking.create({ data: { id, tenantId, roomId: room.id, bookedBy, startsAt, endsAt } }),
      );
      return id;
    };
    return { site, room, tenantId, bookedBy, book };
  }

  it("lists the future bookings that stop a room's deactivation, then deactivates after they are cancelled", async () => {
    const { room, tenantId, book } = await world();
    const bookingId = await book(at(10), at(11));
    const refused = await deactivateRoom(deps, actor, room.id);
    expect(refused).toMatchObject({
      ok: false,
      reason: "has_future_bookings",
      details: {
        total: 1,
        bookings: [{ id: bookingId, roomName: "Sala 1", companyName: expect.stringContaining("deact") }],
      },
    });

    await sqlCancel(bookingId, tenantId);
    const done = await deactivateRoom(deps, actor, room.id);
    expect(done).toMatchObject({ ok: true, value: { deactivatedAt: at(0) } });
  });

  it("waits for a booking in flight and then sees it, so a racing booking is never lost (P-16)", async () => {
    const { room, tenantId, bookedBy } = await world();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted!: () => void;
    const insertedSignal = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    const runtime = createDatabaseClient(inject("databaseUrls").runtimeUrl);
    const inFlight = asTenant(runtime, tenantId, async (tx) => {
      await tx.booking.create({
        data: { id: `b-${unique()}`, tenantId, roomId: room.id, bookedBy, startsAt: at(10), endsAt: at(11) },
      });
      inserted();
      await held;
    });
    await insertedSignal;

    const deactivation = deactivateRoom(deps, actor, room.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await inFlight;
    await expect(deactivation).resolves.toMatchObject({
      ok: false,
      reason: "has_future_bookings",
      details: { total: 1 },
    });
    await runtime.$disconnect();
  });

  it("deactivates a facility only without active rooms, and a client both ways", async () => {
    const { site, room } = await world();
    await expect(deactivateFacility(deps, actor, site.id)).resolves.toEqual({
      ok: false,
      reason: "facility_has_active_rooms",
    });
    await deactivateRoom(deps, actor, room.id);
    await expect(deactivateFacility(deps, actor, site.id)).resolves.toMatchObject({
      ok: true,
      value: { deactivatedAt: at(0) },
    });

    const { client } = await catalog.insertClient(
      { id: `c-${unique()}`, name: "Cliente", slug: `s-${unique()}`, kind: "company", logoUrl: null },
      { id: `u-${unique()}`, name: "Ana" },
    );
    await expect(deactivateClient(deps, actor, client.id)).resolves.toMatchObject({
      ok: true,
      value: { deactivatedAt: at(0) },
    });
  });

  it("refuses an hours change that strands a booking and a block over one, with the list", async () => {
    const { site, room, book } = await world();
    const bookingId = await book(at(18), at(19));

    const stranded = await updateFacility(deps, actor, site.id, { closesAt: 17 * 60 });
    expect(stranded).toMatchObject({
      ok: false,
      reason: "has_future_bookings",
      details: { total: 1, bookings: [{ id: bookingId }] },
    });
    await expect(updateFacility(deps, actor, site.id, { closesAt: 1200, opensAt: 540 })).resolves.toMatchObject({
      ok: true,
    });

    const blocked = await createBlock(deps, actor, {
      facilityId: site.id,
      roomId: room.id,
      startsAt: at(17),
      endsAt: at(20),
      reason: "obra",
    });
    expect(blocked).toMatchObject({ ok: false, reason: "block_has_bookings", details: { total: 1 } });
    await expect(
      createBlock(deps, actor, { facilityId: site.id, roomId: null, startsAt: at(19), endsAt: at(20), reason: "obra" }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("refuses a block over another block of the room or of the sede, touching ends and a released block are fine", async () => {
    const { site, room } = await world();
    const input = (roomId: string | null, startsAt: Date, endsAt: Date) => ({
      facilityId: site.id,
      roomId,
      startsAt,
      endsAt,
      reason: "obra",
    });

    const first = await createBlock(deps, actor, input(room.id, at(10), at(12)));
    expect(first).toMatchObject({ ok: true });
    for (const refused of [
      input(room.id, at(11), at(13)), // overlaps the room's block
      input(room.id, at(10), at(12)), // the same range again
      input(null, at(9), at(11)), // the whole sede, over the room's block
    ]) {
      await expect(createBlock(deps, actor, refused)).resolves.toEqual({ ok: false, reason: "block_overlaps_block" });
    }
    // The sede's block closes every room, so a block of the room under it is refused too.
    await expect(createBlock(deps, actor, input(null, at(14), at(16)))).resolves.toMatchObject({ ok: true });
    await expect(createBlock(deps, actor, input(room.id, at(15), at(17)))).resolves.toEqual({
      ok: false,
      reason: "block_overlaps_block",
    });
    // Touching ends do not overlap, and a released block stops counting.
    await expect(createBlock(deps, actor, input(room.id, at(12), at(14)))).resolves.toMatchObject({ ok: true });
    await operator.block.update({ where: { id: first.ok ? first.value.id : "" }, data: { releasedAt: at(0) } });
    await expect(createBlock(deps, actor, input(room.id, at(10), at(12)))).resolves.toMatchObject({ ok: true });

    const stored = await operator.block.count({ where: { facilityId: site.id, releasedAt: null } });
    expect(stored).toBe(3);
  });

  it("lets only one of several blocks created at the same time through, never two on the same time (P-18)", async () => {
    const { site, room } = await world();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_unused, index) =>
        createBlock(deps, actor, {
          facilityId: site.id,
          // Half of them close the room, half the whole sede: they all overlap each other.
          roomId: index % 2 === 0 ? room.id : null,
          startsAt: at(10),
          endsAt: at(12),
          reason: `obra ${index}`,
        }),
      ),
    );

    expect(resultOutcomes(results)).toEqual(oneWinner(6, "block_overlaps_block"));
    expect(await operator.block.count({ where: { facilityId: site.id, releasedAt: null } })).toBe(1);
  });
});

async function sqlCancel(bookingId: string, tenantId: string) {
  await asTenant(createDatabaseClient(inject("databaseUrls").ownerUrl), tenantId, (tx) =>
    tx.booking.update({ where: { id: bookingId }, data: { status: "cancelled", cancelledAt: new Date() } }),
  );
}
