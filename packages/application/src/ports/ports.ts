import type { TenantId } from "@espacios/domain";

export interface Clock {
  now(): Date;
}

/** Time-ordered unique ids (UUIDv7) so records sort by creation. */
export interface IdGenerator {
  next(): string;
}

/**
 * Repositories obtained from a `TenantTransaction` are already scoped to one tenant (and protected by RLS),
 * so their methods never take a tenant id. Add each repository here as its slice is built.
 */
export type TenantTransaction = Record<string, never>;

/**
 * Runs `work` in one database transaction scoped to a tenant. Everything written inside commits together,
 * and a thrown error rolls everything back. Use cases validate before writing, so a returned failure
 * leaves nothing to roll back.
 */
export interface UnitOfWork {
  run<T>(tenantId: TenantId, work: (tx: TenantTransaction) => Promise<T>): Promise<T>;
}

/** Thrown by repositories when an update is based on a stale version. */
export class ConcurrencyError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was changed by someone else.`);
    this.name = "ConcurrencyError";
  }
}
