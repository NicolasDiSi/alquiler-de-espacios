import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createPrismaRoomCatalog } from "./room-catalog";
import { createRoom } from "./testing/fixtures";

const { ownerUrl, runtimeUrl } = inject("databaseUrls");
const owner = createDatabaseClient(ownerUrl);
const runtime = createDatabaseClient(runtimeUrl);
const catalog = createPrismaRoomCatalog(runtime);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
});

describe("prisma room catalog (runtime role, no tenant set)", () => {
  it("lists rooms with id, name and capacity only", async () => {
    const roomId = await createRoom(owner);

    const rooms = await catalog.listRooms();

    expect(rooms).toContainEqual({ id: roomId, name: roomId, capacity: 6 });
    expect(Object.keys(rooms[0] ?? {}).sort()).toEqual(["capacity", "id", "name"]);
  });

  it("finds one room by id, and null for an unknown id", async () => {
    const roomId = await createRoom(owner);

    await expect(catalog.findRoom(roomId)).resolves.toEqual({ id: roomId, name: roomId, capacity: 6 });
    await expect(catalog.findRoom("room-that-does-not-exist")).resolves.toBeNull();
  });
});
