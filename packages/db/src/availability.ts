import type { AvailabilityQuery } from "@espacios/application";

import type { TransactionClient } from "./client";

/**
 * `rooms_busy_intervals` (spec 0008) inside the tenant transaction: the function marks `mine` against the tenant the
 * unit of work set, so this adapter never passes a company. It reads start, end, kind and `mine`, nothing else.
 */
export function createAvailabilityQuery(tx: TransactionClient): AvailabilityQuery {
  return {
    busyIntervals: async (from, to, roomId) => {
      const rows = await tx.$queryRaw<
        { room_id: string; starts_at: Date; ends_at: Date; kind: "booked" | "blocked"; mine: boolean }[]
      >`SELECT room_id, starts_at, ends_at, kind, mine FROM rooms_busy_intervals(${from}, ${to}, ${roomId ?? null}::text)`;
      return rows.map((row) => ({
        roomId: row.room_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        kind: row.kind,
        mine: row.mine,
      }));
    },
  };
}
