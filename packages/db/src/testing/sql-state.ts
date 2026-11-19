import { sqlState } from "../sql-state";

/** Resolves to the SQLSTATE of the error the promise rejects with, or fails the test if it resolves. */
export async function sqlStateOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return sqlState(error);
  }
  throw new Error("expected the statement to fail, but it succeeded");
}
