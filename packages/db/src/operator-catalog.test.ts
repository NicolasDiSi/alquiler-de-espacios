import { MissingReferenceError, UniqueViolationError } from "@espacios/application";
import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createPrismaOperatorCatalog } from "./operator-catalog";
import { at } from "./testing/fixtures";

const operator = createDatabaseClient(inject("databaseUrls").operatorUrl);
const catalog = createPrismaOperatorCatalog(operator);

afterAll(async () => {
  await operator.$disconnect();
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
