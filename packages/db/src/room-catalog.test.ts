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
});
