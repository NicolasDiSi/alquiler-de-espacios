import type {
  OperatorBookingFilter,
  OperatorBookingRecord,
  OperatorBookingsPageQuery,
  OperatorQueries,
} from "@espacios/application";
import type { BookingId } from "@espacios/domain";

import type { DatabaseClient } from "./client";
import type { Prisma } from "./generated/prisma/client";

const RECORD_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  createdAt: true,
  cancelledAt: true,
  company: { select: { id: true, name: true } },
  room: { select: { id: true, name: true, facility: { select: { timeZone: true } } } },
  user: { select: { name: true } },
} as const satisfies Prisma.BookingSelect;

type Row = Prisma.BookingGetPayload<{ select: typeof RECORD_SELECT }>;

function toRecord(row: Row): OperatorBookingRecord {
  return {
    id: row.id as BookingId,
    company: row.company,
    room: { id: row.room.id, name: row.room.name, timeZone: row.room.facility.timeZone },
    bookedBy: { name: row.user.name },
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    createdAt: row.createdAt,
    cancelledAt: row.cancelledAt,
  };
}

function matching(filter: OperatorBookingFilter): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  if (filter.companyId) where.tenantId = filter.companyId;
  if (filter.roomId) where.roomId = filter.roomId;
  if (filter.facilityId) where.room = { facilityId: filter.facilityId };
  if (filter.status) where.status = filter.status;
  if (filter.from || filter.to) {
    where.startsAt = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) };
  }
  return where;
}

/**
 * The operator's global reads, on the operator login: `BYPASSRLS` and `SELECT` only. There is no tenant filter on
 * purpose, the operator sees every company (spec 0004). Two runs, ordered on `(starts_at, id)`: not ended yet (soonest
 * first), then ended (most recent first). The second run only starts once the first has no more rows.
 */
export function createPrismaOperatorQueries(db: DatabaseClient): OperatorQueries {
  const run = (
    query: OperatorBookingsPageQuery,
    kind: "upcoming" | "past",
    cursor: OperatorBookingsPageQuery["after"],
    take: number,
  ) => {
    const asc = kind === "upcoming";
    const beyond = asc ? "gt" : "lt";
    const where: Prisma.BookingWhereInput[] = [
      matching(query.filter),
      asc ? { endsAt: { gt: query.now } } : { endsAt: { lte: query.now } },
    ];
    if (cursor) {
      where.push({
        OR: [{ startsAt: { [beyond]: cursor.startsAt } }, { startsAt: cursor.startsAt, id: { [beyond]: cursor.id } }],
      });
    }
    return db.booking.findMany({
      where: { AND: where },
      orderBy: [{ startsAt: asc ? "asc" : "desc" }, { id: asc ? "asc" : "desc" }],
      take,
      select: RECORD_SELECT,
    });
  };

  return {
    listBookings: async (query) => {
      const { after, limit } = query;
      const first = after?.run ?? "upcoming";
      const rows = await run(query, first, after, limit);
      if (first === "past" || rows.length >= limit) return rows.map(toRecord);
      const rest = await run(query, "past", null, limit - rows.length);
      return [...rows, ...rest].map(toRecord);
    },
  };
}
