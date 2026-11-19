import type { RoomCatalog, RoomView } from "@espacios/application";

import type { DatabaseClient } from "./client";
import type { Prisma } from "./generated/prisma/client";

const ROOM_SELECT = {
  id: true,
  name: true,
  capacity: true,
  deactivatedAt: true,
  facility: {
    select: {
      id: true,
      name: true,
      timeZone: true,
      opensAt: true,
      closesAt: true,
      openWeekdays: true,
      deactivatedAt: true,
    },
  },
} as const satisfies Prisma.RoomSelect;

type Row = Prisma.RoomGetPayload<{ select: typeof ROOM_SELECT }>;

function toView(row: Row): RoomView {
  const { facility } = row;
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    // A room takes bookings only while it and its facility are both active (spec 0004).
    active: row.deactivatedAt === null && facility.deactivatedAt === null,
    facility: {
      id: facility.id,
      name: facility.name,
      timeZone: facility.timeZone,
      opensAt: facility.opensAt,
      closesAt: facility.closesAt,
      openWeekdays: facility.openWeekdays,
    },
  };
}

/**
 * `room` and `facility` have no tenant and no row level security; the runtime login has `SELECT` on both. The list
 * hides rooms that take no bookings; `findRoom` returns any room so the use case can tell "inactive" from "not found".
 */
export function createPrismaRoomCatalog(db: DatabaseClient): RoomCatalog {
  return {
    listRooms: async () => {
      const rows = await db.room.findMany({
        where: { deactivatedAt: null, facility: { deactivatedAt: null } },
        select: ROOM_SELECT,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      return rows.map(toView);
    },
    findRoom: async (id) => {
      const row = await db.room.findUnique({ where: { id }, select: ROOM_SELECT });
      return row ? toView(row) : null;
    },
    // Companies have no grant on `block`: the availability function is the only way in, and it returns nothing but
    // the interval and its `kind` (spec 0004, AC-20). The parameters are bound, never interpolated.
    isBlocked: async (roomId, startsAt, endsAt) => {
      const rows = await db.$queryRaw<{ blocked: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM room_busy_intervals(${roomId}, ${startsAt}::timestamptz, ${endsAt}::timestamptz) WHERE kind = 'blocked'
        ) AS blocked`;
      return rows[0]?.blocked === true;
    },
  };
}
