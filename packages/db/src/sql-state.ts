import { BusyError, ConcurrencyError, RuleViolationError } from "@espacios/application";

type WrappedError = {
  readonly code?: unknown;
  readonly cause?: { readonly originalCode?: unknown };
  readonly meta?: {
    readonly code?: unknown;
    readonly driverAdapterError?: { readonly cause?: { readonly originalCode?: unknown } };
  };
};

const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The SQLSTATE behind an error from Prisma 7 with the pg adapter. The driver error arrives wrapped, not as `err.code`:
 * a `PrismaClientKnownRequestError` whose `meta.driverAdapterError.cause.originalCode` (model queries) or `meta.code`
 * (raw queries) holds it, or a bare `DriverAdapterError` whose `cause.originalCode` does.
 */
export function sqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const wrapped = error as WrappedError;
  const candidates = [
    wrapped.meta?.driverAdapterError?.cause?.originalCode,
    wrapped.cause?.originalCode,
    wrapped.meta?.code,
  ];
  return candidates.find((code): code is string => typeof code === "string" && SQLSTATE.test(code));
}

/** `23P01`: the exclusion constraint refused an overlapping confirmed booking. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * The custom SQLSTATEs of the booking guard trigger (migration `operator_administration`, spec 0004): each is one
 * reason a booking that looked fine to the use case cannot be stored any more.
 */
const GUARD_REFUSALS = {
  EB001: "room_inactive",
  EB002: "company_inactive",
  EB003: "outside_hours",
  EB004: "room_blocked",
} as const;

/** Lock timeout, statement timeout, deadlock and serialization failure: nothing was written, a retry may work. */
const BUSY_STATES = new Set(["55P03", "57014", "40P01", "40001"]);

/** Prisma's own code for an interactive transaction that timed out or could not get a connection. */
const TRANSACTION_UNAVAILABLE = "P2028";

/**
 * Turns a database error into the error the application understands (spec 0001): an overlap becomes
 * `ConcurrencyError`, a refusal of the booking guard becomes `RuleViolationError`, a timeout becomes `BusyError`. Anything else is returned unchanged, to be thrown on as a bug.
 * Call it outside `$transaction`, once PostgreSQL has rolled the aborted transaction back.
 */
export function translateDatabaseError(error: unknown): unknown {
  const state = sqlState(error);
  if (state === EXCLUSION_VIOLATION) return new ConcurrencyError({ cause: error });
  if (state && Object.hasOwn(GUARD_REFUSALS, state)) {
    return new RuleViolationError(GUARD_REFUSALS[state as keyof typeof GUARD_REFUSALS], { cause: error });
  }
  if ((state && BUSY_STATES.has(state)) || (error as WrappedError | null)?.code === TRANSACTION_UNAVAILABLE) {
    return new BusyError({ cause: error });
  }
  return error;
}
