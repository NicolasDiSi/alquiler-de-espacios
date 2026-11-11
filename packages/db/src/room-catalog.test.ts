import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createPrismaRoomCatalog } from "./room-catalog";
import { createRoom, TEST_FACILITY_ID } from "./testing/fixtures";

const { ownerUrl, runtimeUrl } = inject("databaseUrls");
const owner = createDatabaseClient(ownerUrl);
const runtime = createDatabaseClient(runtimeUrl);
const catalog = createPrismaRoomCatalog(runtime);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
});

describe("prisma room catalog (runtime role, no tenant set)", () => {
  const FACILITY = {
    id: TEST_FACILITY_ID,
    name: "Test facility (always open)",
    timeZone: "America/Argentina/Buenos_Aires",
    opensAt: 0,
    closesAt: 1440,
    openWeekdays: [0, 1, 2, 3, 4, 5, 6],
  };

  it("lists rooms with their facility rules and nothing about bookings", async () => {
    const roomId = await createRoom(owner);

    const rooms = await catalog.listRooms();

    expect(rooms).toContainEqual({ id: roomId, name: roomId, capacity: 6, active: true, facility: FACILITY });
    expect(Object.keys(rooms[0] ?? {}).sort()).toEqual(["active", "capacity", "facility", "id", "name"]);
  });

  it("finds one room by id, and null for an unknown id", async () => {
    const roomId = await createRoom(owner);

    await expect(catalog.findRoom(roomId)).resolves.toMatchObject({ id: roomId, facility: FACILITY });
    await expect(catalog.findRoom("room-that-does-not-exist")).resolves.toBeNull();
  });

  it("hides a deactivated room from the list but still finds it, marked inactive (spec 0004)", async () => {
    const roomId = await createRoom(owner);
    await owner.room.update({ where: { id: roomId }, data: { deactivatedAt: new Date() } });

    expect((await catalog.listRooms()).map((room) => room.id)).not.toContain(roomId);
    await expect(catalog.findRoom(roomId)).resolves.toMatchObject({ id: roomId, active: false });
  });

  it("treats the rooms of a deactivated facility as inactive", async () => {
    const facilityId = `facility-cat-${crypto.randomUUID()}`;
    await owner.facility.create({
      data: { id: facilityId, name: facilityId, timeZone: "UTC", opensAt: 480, closesAt: 1200, openWeekdays: [1] },
    });
    const roomId = await createRoom(owner, facilityId);
    await owner.facility.update({ where: { id: facilityId }, data: { deactivatedAt: new Date() } });

    expect((await catalog.listRooms()).map((room) => room.id)).not.toContain(roomId);
    await expect(catalog.findRoom(roomId)).resolves.toMatchObject({ active: false });
  });
});
