/**
 * The SQLSTATE behind a Prisma error. With Prisma 7 and the pg adapter a database error arrives wrapped: a
 * `PrismaClientKnownRequestError` (P2039, P2010...) whose `meta` carries the driver error. The application's own
 * `sqlState(err)` helper belongs to the error contract feature; tests use this one until then.
 */
export function sqlState(error: unknown): string | undefined {
  const meta = (error as { meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } } })
    .meta;
  const code = meta?.driverAdapterError?.cause?.originalCode ?? meta?.code;
  return typeof code === "string" ? code : undefined;
}

/** Resolves to the SQLSTATE of the error the promise rejects with, or fails the test if it resolves. */
export async function sqlStateOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return sqlState(error);
  }
  throw new Error("expected the statement to fail, but it succeeded");
}
