import { fail, type Result } from "@espacios/domain";

import { BusyError, type Clock, ConcurrencyError, type IdGenerator, type UnitOfWork } from "../ports/ports";

export type Dependencies = {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
};

/**
 * Wraps a use case's unit of work. A race lost to another transaction becomes `conflict`, a database that could not
 * answer in time becomes `busy`; both leave nothing written. Any other error is a bug and is thrown on.
 */
export async function withRaceHandling<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ConcurrencyError) return fail("conflict");
    if (error instanceof BusyError) return fail("busy");
    throw error;
  }
}
