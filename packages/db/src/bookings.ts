import type {
  BookingRecord,
  BookingRepository,
  MyBookingsPageQuery,
  MyBookingsQuery,
  MyBookingsView,
} from "@espacios/application";
import type { BookingId, TenantId } from "@espacios/domain";

import type { TransactionClient } from "./client";
import type { Prisma } from "./generated/prisma/client";

/** The columns a `BookingRecord` needs: the room's name and who booked it, never the company. */
const RECORD_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  createdAt: true,
  cancelledAt: true,
  room: { select: { id: true, name: true, facility: { select: { timeZone: true } } } },
  user: { select: { name: true } },
} as const satisfies Prisma.BookingSelect;

type Row = Prisma.BookingGetPayload<{ select: typeof RECORD_SELECT }>;

function toRecord(row: Row): BookingRecord {
  return {
    id: row.id as BookingId,
    room: { id: row.room.id, name: row.room.name, timeZone: row.room.facility.timeZone },
    bookedBy: { name: row.user.name },
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    createdAt: row.createdAt,
    cancelledAt: row.cancelledAt,
  };
}

/**
 * The company edge's writes, inside one tenant transaction. Every query filters by `tenantId` as well as relying on
 * row level security (the two barriers of `packages/db/AGENTS.md`).
 */
export function createBookingRepository(tx: TransactionClient, tenantId: TenantId): BookingRepository {
  const findOwn = async (where: Prisma.BookingWhereInput) => {
    const row = await tx.booking.findFirst({ where: { ...where, tenantId }, select: RECORD_SELECT });
    return row ? toRecord(row) : null;
  };

  return {
    // Spec 0001: `ON CONFLICT DO NOTHING` (no conflict target) also covers the exclusion constraint. It waits for a
    // conflicting transaction still in flight, then inserts nothing if that one committed. Prisma cannot express it,
    // so it is raw SQL; the parameters are bound, never interpolated.
    insertIfFree: async (booking) => {
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO booking (id, tenant_id, room_id, booked_by, starts_at, ends_at, created_at)
        VALUES (${booking.id}, ${tenantId}, ${booking.roomId}, ${booking.bookedBy},
                ${booking.startsAt}::timestamptz, ${booking.endsAt}::timestamptz, ${booking.createdAt}::timestamptz)
        ON CONFLICT DO NOTHING
        RETURNING id`;
      return inserted.length > 0 ? findOwn({ id: booking.id }) : null;
    },

    findExactConfirmed: (slot) =>
      findOwn({ roomId: slot.roomId, startsAt: slot.startsAt, endsAt: slot.endsAt, status: "confirmed" }),
  };
}

type ViewQuery = {
  readonly where: (now: Date) => Prisma.BookingWhereInput;
  readonly direction: Prisma.SortOrder;
};

/**
 * Spec 0003, Value sourcing: upcoming is confirmed and not ended, by `(starts_at, id)` ascending; past is confirmed
 * and ended, descending; cancelled is cancelled, descending. The `(tenant_id, starts_at, id)` index serves all three.
 */
const VIEWS: Record<MyBookingsView, ViewQuery> = {
  upcoming: { where: (now) => ({ status: "confirmed", endsAt: { gt: now } }), direction: "asc" },
  past: { where: (now) => ({ status: "confirmed", endsAt: { lte: now } }), direction: "desc" },
  cancelled: { where: () => ({ status: "cancelled" }), direction: "desc" },
};

/** Keyset pagination: strictly after the last row of the previous page, in the view's order. */
function afterPosition(query: MyBookingsPageQuery, direction: Prisma.SortOrder): Prisma.BookingWhereInput {
  if (!query.after) return {};
  const beyond = direction === "asc" ? "gt" : "lt";
  const { startsAt, id } = query.after;
  return { OR: [{ startsAt: { [beyond]: startsAt } }, { startsAt, id: { [beyond]: id } }] };
}

/** The company edge's list of its own bookings, inside one tenant transaction. */
export function createMyBookingsQuery(tx: TransactionClient, tenantId: TenantId): MyBookingsQuery {
  return {
    list: async (query) => {
      const view = VIEWS[query.view];
      const rows = await tx.booking.findMany({
        where: { AND: [{ tenantId }, view.where(query.now), afterPosition(query, view.direction)] },
        orderBy: [{ startsAt: view.direction }, { id: view.direction }],
        take: query.limit,
        select: RECORD_SELECT,
      });
      return rows.map(toRecord);
    },
  };
}
