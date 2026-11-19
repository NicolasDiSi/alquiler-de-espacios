import type { TenantTransaction, UnitOfWork } from "@espacios/application";
import type { TenantId } from "@espacios/domain";

import { createAvailabilityQuery } from "./availability";
import { createBookingRepository, createMyBookingsQuery } from "./bookings";
import type { DatabaseClient, TransactionClient } from "./client";
import { translateDatabaseError } from "./sql-state";

export type PrismaUnitOfWorkOptions = {
  /** How long a request waits for a free connection before it is `busy` (Prisma's own default, made explicit). */
  readonly maxWaitMs?: number;
  /** Interactive transactions hold a connection; keep them short. */
  readonly timeoutMs?: number;
  /** How long a statement waits for a lock (a conflicting booking still in flight) before giving up as `busy`. */
  readonly lockTimeoutMs?: number;
  /** How long one statement may run before it is cancelled as `busy`. */
  readonly statementTimeoutMs?: number;
};

/** Spec 0001: `SET LOCAL lock_timeout = '3s'` and `statement_timeout = '5s'` in every tenant transaction. */
const DEFAULTS = { maxWaitMs: 2_000, timeoutMs: 10_000, lockTimeoutMs: 3_000, statementTimeoutMs: 5_000 } as const;

/**
 * Each `run` is one database transaction that first sets `app.tenant_id` with `set_config(..., true)` (a `SET LOCAL`
 * that accepts parameters). Row-level security then limits every statement to that tenant, and every repository
 * also filters by tenant, so a forgotten filter or a wrong id cannot reach another tenant's rows.
 */
export function createPrismaUnitOfWork(db: DatabaseClient, options: PrismaUnitOfWorkOptions = {}): UnitOfWork {
  return {
    run: (tenantId, work) =>
      runInTenantTransaction(db, tenantId, (tx) => work(tenantTransaction(tx, tenantId)), options),
  };
}

/**
 * The transaction behind `UnitOfWork.run`, on the raw Prisma client. The tenant and both timeouts are set in one
 * round trip and last only for this transaction. A database error is translated after `$transaction` has rolled
 * back (the PostgreSQL transaction is already aborted): an overlap throws `ConcurrencyError`, a timeout `BusyError`.
 */
export async function runInTenantTransaction<T>(
  db: DatabaseClient,
  tenantId: TenantId,
  work: (tx: TransactionClient) => Promise<T>,
  options: PrismaUnitOfWorkOptions = {},
): Promise<T> {
  const { maxWaitMs, timeoutMs, lockTimeoutMs, statementTimeoutMs } = { ...DEFAULTS, ...options };
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true),
          set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true),
          set_config('statement_timeout', ${`${statementTimeoutMs}ms`}, true)`;
        return work(tx);
      },
      { maxWait: maxWaitMs, timeout: timeoutMs },
    );
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

/** Add each repository here as its slice is built; every query filters by `tenantId` as well as relying on RLS. */
function tenantTransaction(tx: TransactionClient, tenantId: TenantId): TenantTransaction {
  return {
    bookings: createBookingRepository(tx, tenantId),
    myBookings: createMyBookingsQuery(tx, tenantId),
    availability: createAvailabilityQuery(tx),
  };
}
