import {
  type BlockRecord,
  type ClientRecord,
  type FacilityRecord,
  MissingReferenceError,
  type OperatorCatalog,
  type RoomRecord,
  UniqueViolationError,
} from "@espacios/application";

import type { DatabaseClient } from "./client";
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
  const catalog: OperatorCatalog = {
    listFacilities: (includeInactive) =>
      db.facility.findMany({ where: active(includeInactive), orderBy: [{ name: "asc" }, { id: "asc" }] }),
    findFacility: (id) => db.facility.findUnique({ where: { id } }),
    insertFacility: (data) => db.facility.create({ data }) as Promise<FacilityRecord>,
    updateFacility: (id, data) => orNull(db.facility.update({ where: { id }, data })),

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

  // Every call goes through `translate`, so the use cases see application errors and never driver errors.
  return Object.fromEntries(
    Object.entries(catalog).map(([name, method]) => [
      name,
      async (...args: unknown[]) => {
        try {
          return await (method as (...inner: unknown[]) => Promise<unknown>)(...args);
        } catch (error) {
          throw translate(error);
        }
      },
    ]),
  ) as unknown as OperatorCatalog;
}
