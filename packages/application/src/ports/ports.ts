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

/**
 * Thrown by the adapter when a concurrent write won the race: the database overlap constraint refused the row
 * (`23P01`). The use case turns it into `conflict`. The driver error stays in `cause` and never reaches a response.
 */
export class ConcurrencyError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("A concurrent write won the race for the same room and time.", options);
    this.name = "ConcurrencyError";
  }
}

/**
 * Thrown by the adapter when the database could not answer in time: lock or statement timeout, deadlock,
 * serialization failure, or no transaction available. Nothing was written; the use case turns it into `busy`.
 */
export class BusyError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The database is busy. Retry in a moment.", options);
    this.name = "BusyError";
  }
}
