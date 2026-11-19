import type { Result } from "@espacios/domain";

import { sqlState } from "../sql-state";

/**
 * What each racer got, sorted, so a race test asserts every outcome at once and a failure prints all of them: `ok`
 * for a win, else the SQLSTATE, else the error's class and message (a timeout, a pool error). Asserting the count of
 * winners first would fail with "expected 1, got 0" and hide why every racer lost.
 */
export function settledOutcomes(results: readonly PromiseSettledResult<unknown>[]): string[] {
  return results
    .map((result) => {
      if (result.status === "fulfilled") return "ok";
      const error: unknown = result.reason;
      return (
        sqlState(error) ?? (error instanceof Error ? `${error.name}: ${error.message.slice(0, 160)}` : String(error))
      );
    })
    .sort();
}

/** The same for use case results: `ok`, or the refusal's reason. */
export function resultOutcomes(results: readonly Result<unknown>[]): string[] {
  return results.map((result) => (result.ok ? "ok" : result.reason)).sort();
}

/** The expected outcomes of a race: one `ok` and every other racer refused with `reason`, in sorted order. */
export function oneWinner(racers: number, reason: string): string[] {
  return ["ok", ...Array.from({ length: racers - 1 }, () => reason)].sort();
}
