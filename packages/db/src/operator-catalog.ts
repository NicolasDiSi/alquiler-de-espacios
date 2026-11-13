import {
  type BlockRecord,
  type BlockTarget,
  type BookingScope,
  type ClientRecord,
  type FacilityRecord,
  MissingReferenceError,
  type OperatorCatalog,
  type OperatorCatalogTransaction,
  type RoomRecord,
  UniqueViolationError,
} from "@espacios/application";

import type { DatabaseClient, TransactionClient } from "./client";
import { sqlState, translateDatabaseError } from "./sql-state";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
/** Prisma's code for an update or delete of a row that does not exist. */
const RECORD_NOT_FOUND = "P2025";

/** A taken unique value or a missing reference becomes the application's error; timeouts become `BusyError`. */
function translate(error: unknown): unknown {
  const state = sqlState(error);
  if (state === UNIQUE_VIOLATION) return new UniqueViolationError({ cause: error });
  if (state === FOREIGN_KEY_VIOLATION) return new MissingReferenceError({ cause: error });
  return translateDatabaseError(error);
}

/** An update of a row that is not there is `null`, the way `find` says it. */
async function orNull<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === RECORD_NOT_FOUND) return null;
    throw error;
  }
}

const active = (includeInactive: boolean) => (includeInactive ? {} : { deactivatedAt: null });

/**
 * The operator's catalog on the operator login (`espacios_operator`, spec 0004): it may write `facility`, `room`,
 * `company`, `block` and insert members, and never `booking`. Wired only in `apps/web/src/composition`. Rows already
 * have the shape of the application's records, so no mapping is needed.
 */
export function createPrismaOperatorCatalog(db: DatabaseClient): OperatorCatalog {
  return {
    ...translated(catalogMethods(db)),
    transaction: async (work) => {
      try {
        return await db.$transaction((tx) => work(transactionCatalog(tx)));
      } catch (error) {
        throw translate(error);
      }
    },
  };
}

type Db = DatabaseClient | TransactionClient;
type CatalogMethods = Omit<OperatorCatalog, "transaction">;

/** Every call goes through `translate`, so the use cases see application errors and never driver errors. */
function translated<T extends object>(methods: T): T {
  return Object.fromEntries(
    Object.entries(methods).map(([name, method]) => [
      name,
      async (...args: unknown[]) => {
        try {
          return await (method as (...inner: unknown[]) => Promise<unknown>)(...args);
        } catch (error) {
          throw translate(error);
        }
      },
    ]),
  ) as T;
}

const bookingWhere = (scope: BookingScope) =>
  "roomId" in scope ? { roomId: scope.roomId } : { room: { facilityId: scope.facilityId } };

/** The same catalog on one transaction, plus the locks and the reads of bookings in the way (spec 0004, P-16 to P-18). */
function transactionCatalog(tx: TransactionClient): OperatorCatalogTransaction {
  const affected = async (where: object) =>
    (
      await tx.booking.findMany({
        where: { status: "confirmed", ...where },
        include: { room: { select: { name: true } }, company: { select: { name: true } } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      })
    ).map((row) => ({
      id: row.id,
      roomId: row.roomId,
      roomName: row.room.name,
      companyId: row.tenantId,
      companyName: row.company.name,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    }));

  return {
    ...translated(catalogMethods(tx)),
    ...translated({
      // The lock first, then a plain read: a new statement sees what committed while the lock waited.
      lockFacility: async (id: string) => {
        await tx.$queryRaw`SELECT id FROM facility WHERE id = ${id} FOR UPDATE`;
        return tx.facility.findUnique({ where: { id } }) as Promise<FacilityRecord | null>;
      },
      lockRoom: async (id: string) => {
        await tx.$queryRaw`SELECT id FROM room WHERE id = ${id} FOR UPDATE`;
        return tx.room.findUnique({ where: { id } });
      },
      lockClient: async (id: string) => {
        await tx.$queryRaw`SELECT id FROM company WHERE id = ${id} FOR UPDATE`;
        return tx.company.findUnique({ where: { id } }) as Promise<ClientRecord | null>;
      },
      futureBookings: (scope: BookingScope, after: Date) =>
        affected({ ...bookingWhere(scope), startsAt: { gt: after } }),
      overlappingBookings: (scope: BookingScope, startsAt: Date, endsAt: Date) =>
        affected({ ...bookingWhere(scope), startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }),
      overlappingBlocks: (target: BlockTarget, startsAt: Date, endsAt: Date) =>
        tx.block.findMany({
          where: {
            facilityId: target.facilityId,
            releasedAt: null,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
            // A room is closed by its own blocks and by the whole sede's; the whole sede, by every block of it.
            ...(target.roomId === null ? {} : { OR: [{ roomId: target.roomId }, { roomId: null }] }),
          },
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        }) as Promise<readonly BlockRecord[]>,
      countActiveRooms: (facilityId: string) => tx.room.count({ where: { facilityId, deactivatedAt: null } }),
      setFacilityDeactivation: (id: string, at: Date | null) =>
        orNull(tx.facility.update({ where: { id }, data: { deactivatedAt: at } })),
      setRoomDeactivation: (id: string, at: Date) =>
        orNull(tx.room.update({ where: { id }, data: { deactivatedAt: at } })),
      setClientDeactivation: (id: string, at: Date | null) =>
        orNull(tx.company.update({ where: { id }, data: { deactivatedAt: at } })),
    }),
  } as OperatorCatalogTransaction;
}

function catalogMethods(db: Db): CatalogMethods {
  return {
    listFacilities: (includeInactive) =>
      db.facility.findMany({ where: active(includeInactive), orderBy: [{ name: "asc" }, { id: "asc" }] }),
    findFacility: (id) => db.facility.findUnique({ where: { id } }),
    insertFacility: (data) =>
      db.facility.create({ data: { ...data, openWeekdays: [...data.openWeekdays] } }) as Promise<FacilityRecord>,
    updateFacility: (id, { openWeekdays, ...rest }) =>
      orNull(
        db.facility.update({
          where: { id },
          data: { ...rest, ...(openWeekdays ? { openWeekdays: [...openWeekdays] } : {}) },
        }),
      ),

    listRooms: ({ facilityId, includeInactive }) =>
      db.room.findMany({
        where: { ...active(includeInactive), ...(facilityId ? { facilityId } : {}) },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    findRoom: (id) => db.room.findUnique({ where: { id } }),
    insertRoom: (data) => db.room.create({ data }) as Promise<RoomRecord>,
    updateRoom: (id, data) => orNull(db.room.update({ where: { id }, data })),

    listClients: (includeInactive) =>
      db.company.findMany({ where: active(includeInactive), orderBy: [{ name: "asc" }, { id: "asc" }] }),
    findClient: (id) => db.company.findUnique({ where: { id } }),
    insertClient: (client, firstMember) =>
      db.$transaction(async (tx) => {
        const created = (await tx.company.create({ data: client })) as ClientRecord;
        const member = await tx.appUser.create({
          data: { id: firstMember.id, name: firstMember.name, role: "member", tenantId: created.id },
          select: { id: true, name: true, createdAt: true },
        });
        return { client: created, member };
      }),
    updateClient: (id, data) => orNull(db.company.update({ where: { id }, data })),

    listMembers: (clientId) =>
      db.appUser.findMany({
        where: { tenantId: clientId, role: "member" },
        select: { id: true, name: true, createdAt: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    insertMember: (clientId, member) =>
      db.appUser.create({
        data: { id: member.id, name: member.name, role: "member", tenantId: clientId },
        select: { id: true, name: true, createdAt: true },
      }),

    listBlocks: ({ facilityId, roomId, includeReleased }) =>
      db.block.findMany({
        where: {
          ...(includeReleased ? {} : { releasedAt: null }),
          ...(facilityId ? { facilityId } : {}),
          ...(roomId ? { roomId } : {}),
        },
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      }),
    findBlock: (id) => db.block.findUnique({ where: { id } }),
    insertBlock: (data) => db.block.create({ data }) as Promise<BlockRecord>,
    releaseBlock: (id, at) => orNull(db.block.update({ where: { id }, data: { releasedAt: at } })),
  };
}
