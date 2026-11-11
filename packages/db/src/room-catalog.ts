import type { RoomCatalog } from "@espacios/application";

import type { DatabaseClient } from "./client";

const ROOM_SELECT = { id: true, name: true, capacity: true } as const;

/** `room` has no tenant and no row level security; the runtime login has `SELECT` on it. */
export function createPrismaRoomCatalog(db: DatabaseClient): RoomCatalog {
  return {
    listRooms: () => db.room.findMany({ select: ROOM_SELECT, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    findRoom: (id) => db.room.findUnique({ where: { id }, select: ROOM_SELECT }),
  };
}
