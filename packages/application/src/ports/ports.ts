import type { Reason, TenantId } from "@espacios/domain";

import type { BookingRepository, MyBookingsQuery } from "./bookings";

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
export type TenantTransaction = {
  readonly bookings: BookingRepository;
  readonly myBookings: MyBookingsQuery;
};

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
 * Thrown by the adapter when the database guard on `booking` refused an insert (spec 0004): the room, its facility or
 * the company was deactivated, the booking fell outside the opening window, or a block covers it, all decided after the
 * use case looked. The use case turns it into the matching reason. The driver error stays in `cause`.
 */
export class RuleViolationError extends Error {
  constructor(
    readonly reason: Extract<Reason, "room_inactive" | "company_inactive" | "outside_hours" | "room_blocked">,
    options?: { cause?: unknown },
  ) {
    super(`The database refused the booking: ${reason}.`, options);
    this.name = "RuleViolationError";
  }
}

/** Thrown by the operator adapter when a unique value (a name, a slug) is already taken (`23505`). */
export class UniqueViolationError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("That value is already taken.", options);
    this.name = "UniqueViolationError";
  }
}

/** Thrown by the operator adapter when a record points at one that does not exist (`23503`). */
export class MissingReferenceError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("A referenced record does not exist.", options);
    this.name = "MissingReferenceError";
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
