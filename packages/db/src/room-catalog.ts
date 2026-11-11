import type { RoomCatalog } from "@espacios/application";

import type { DatabaseClient } from "./client";

/** `room` has no tenant and no row level security; the runtime login has `SELECT` on it. */
export function createPrismaRoomCatalog(db: DatabaseClient): RoomCatalog {
  return {
    listRooms: () =>
      db.room.findMany({ select: { id: true, name: true, capacity: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
  };
}
