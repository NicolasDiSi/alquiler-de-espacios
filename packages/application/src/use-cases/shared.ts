import { fail, type Result } from "@espacios/domain";

import { type Clock, ConcurrencyError, type IdGenerator, type UnitOfWork } from "../ports/ports";

export type Dependencies = {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
};

/** Turns a lost optimistic-concurrency race into a `conflict` result the UI can show ("reload and retry"). */
export async function withConflictHandling<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ConcurrencyError) return fail("conflict", error.message);
    throw error;
  }
}
