import type { IdGenerator, TenantTransaction, UnitOfWork } from "@espacios/application";
import type { TenantId } from "@espacios/domain";

import type { DatabaseClient, TransactionClient } from "./client";

export type PrismaUnitOfWorkOptions = {
  /** Interactive transactions hold a connection; keep them short. */
  readonly timeoutMs?: number;
};

/**
 * Each `run` is one database transaction that first sets `app.tenant_id` with `set_config(..., true)` (a `SET LOCAL`
 * that accepts parameters). Row-level security then limits every statement to that tenant, and every repository
 * also filters by tenant, so a forgotten filter or a wrong id cannot reach another tenant's rows.
 */
export function createPrismaUnitOfWork(
  db: DatabaseClient,
  ids: IdGenerator,
  options: PrismaUnitOfWorkOptions = {},
): UnitOfWork {
  return {
    run: (tenantId, work) =>
      db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
          return work(tenantTransaction(tx, tenantId, ids));
        },
        { timeout: options.timeoutMs ?? 10_000 },
      ),
  };
}

/** Add each repository here as its slice is built; every query filters by `tenantId` as well as relying on RLS. */
function tenantTransaction(_tx: TransactionClient, _tenantId: TenantId, _ids: IdGenerator): TenantTransaction {
  return {};
}
