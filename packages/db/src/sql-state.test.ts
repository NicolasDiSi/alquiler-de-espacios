import { BusyError, ConcurrencyError, withRaceHandling } from "@espacios/application";
import { ok, type TenantId } from "@espacios/domain";
import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient, type DatabaseClient, type TransactionClient } from "./client";
import { sqlState } from "./sql-state";
import { asTenant, at, book, createMember, createRoom, createTenant, type NewBooking } from "./testing/fixtures";
import { runInTenantTransaction } from "./unit-of-work";

const { ownerUrl, runtimeUrl } = inject("databaseUrls");
const owner = createDatabaseClient(ownerUrl);
// One connection, so a timeout that leaked out of its transaction would show on the next statement.
const runtime = createDatabaseClient(`${runtimeUrl}?connection_limit=1`);
// A second login session that holds a conflicting booking open while `runtime` waits on it.
const holder = createDatabaseClient(`${runtimeUrl}?connection_limit=1`);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect(), holder.$disconnect()]);
});

type Company = { readonly tenantId: TenantId; readonly bookedBy: string };

async function company(name: string): Promise<Company> {
  const tenantId = await createTenant(owner, name);
  return { tenantId, bookedBy: await createMember(owner, tenantId) };
}

function insert(tx: TransactionClient, booking: NewBooking) {
  return tx.booking.create({ data: { id: `booking-${crypto.randomUUID()}`, ...booking } });
}

/** Runs the work the way a use case will: in a tenant transaction, wrapped by `withRaceHandling`. */
function asUseCase(
  db: DatabaseClient,
  tenantId: TenantId,
  work: (tx: TransactionClient) => Promise<unknown>,
  options = {},
) {
  return withRaceHandling(() => runInTenantTransaction(db, tenantId, async (tx) => ok(await work(tx)), options));
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the transaction to fail, but it succeeded");
}

/** A promise the test opens by hand, to hold one transaction while another one runs. */
function gate(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((open) => {
    resolve = open;
  });
  return { promise, resolve };
}

async function bookingsOf(tenantId: TenantId, roomId: string): Promise<number> {
  return asTenant(owner, tenantId, (tx) => tx.booking.count({ where: { tenantId, roomId } }));
}

describe("sqlState (spec 0001, P-9)", () => {
  it("finds no SQLSTATE in an error that is not from the database", () => {
    expect(sqlState(new Error("boom"))).toBeUndefined();
    expect(sqlState(null)).toBeUndefined();
    expect(sqlState("23P01")).toBeUndefined();
  });

  it("unwraps a real 23P01 from Prisma, and the unit of work throws it as a ConcurrencyError", async () => {
    const [acme, globex, roomId] = await Promise.all([company("acme"), company("globex"), createRoom(owner)]);
    await book(runtime, { ...acme, roomId, startsAt: at(10), endsAt: at(11) });

    const error = await rejection(
      runInTenantTransaction(runtime, globex.tenantId, (tx) =>
        insert(tx, { ...globex, roomId, startsAt: at(10, 30), endsAt: at(11, 30) }),
      ),
    );

    expect(error).toBeInstanceOf(ConcurrencyError);
    expect(sqlState((error as ConcurrencyError).cause)).toBe("23P01");
    // The message a response could ever see names no company, user or time.
    expect((error as Error).message).not.toMatch(new RegExp(`${acme.tenantId}|${acme.bookedBy}|${globex.tenantId}`));
  });

  it("maps the overlap to conflict, and nothing is written", async () => {
    const [acme, globex, roomId] = await Promise.all([company("initech"), company("hooli"), createRoom(owner)]);
    await book(runtime, { ...acme, roomId, startsAt: at(10), endsAt: at(12) });

    const result = await asUseCase(runtime, globex.tenantId, (tx) =>
      insert(tx, { ...globex, roomId, startsAt: at(11), endsAt: at(13) }),
    );

    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(await bookingsOf(globex.tenantId, roomId)).toBe(0);
  });

  it("maps a lock timeout (55P03) behind an uncommitted conflicting booking to busy, and nothing is written", async () => {
    const [acme, globex, roomId] = await Promise.all([company("umbrella"), company("stark"), createRoom(owner)]);
    const release = gate();
    const held = gate();

    // Company A inserts 10 to 11 and keeps its transaction open, so B's overlapping insert has to wait for it.
    const holding = asTenant(holder, acme.tenantId, async (tx) => {
      await insert(tx, { ...acme, roomId, startsAt: at(10), endsAt: at(11) });
      held.resolve();
      await release.promise;
    });
    await held.promise;

    let caught: unknown;
    const result = await withRaceHandling(async () => {
      try {
        return await runInTenantTransaction(
          runtime,
          globex.tenantId,
          async (tx) => ok(await insert(tx, { ...globex, roomId, startsAt: at(10), endsAt: at(11) })),
          { lockTimeoutMs: 200 },
        );
      } catch (error) {
        caught = error;
        throw error;
      }
    });
    release.resolve();
    await holding;

    expect(result).toEqual({ ok: false, reason: "busy" });
    expect(caught).toBeInstanceOf(BusyError);
    expect(sqlState((caught as BusyError).cause)).toBe("55P03");
    expect(await bookingsOf(globex.tenantId, roomId)).toBe(0);
  });

  it("maps a statement timeout (57014) to busy", async () => {
    const { tenantId } = await company("wayne");
    const error = await rejection(
      runInTenantTransaction(runtime, tenantId, (tx) => tx.$executeRaw`SELECT pg_sleep(2)`, {
        statementTimeoutMs: 100,
      }),
    );

    expect(error).toBeInstanceOf(BusyError);
    expect(sqlState((error as BusyError).cause)).toBe("57014");
  });

  it("maps an expired transaction (Prisma P2028) to busy", async () => {
    const { tenantId } = await company("cyberdyne");
    const result = await asUseCase(
      runtime,
      tenantId,
      async (tx) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return tx.$executeRaw`SELECT 1`;
      },
      { timeoutMs: 100 },
    );

    expect(result).toEqual({ ok: false, reason: "busy" });
  });

  it("passes any other database error through untouched, as a bug", async () => {
    const [acme, roomId] = await Promise.all([company("tyrell"), createRoom(owner)]);
    const error = await rejection(
      runInTenantTransaction(runtime, acme.tenantId, (tx) =>
        insert(tx, { ...acme, roomId, startsAt: at(11), endsAt: at(10) }),
      ),
    );

    expect(error).not.toBeInstanceOf(ConcurrencyError);
    expect(error).not.toBeInstanceOf(BusyError);
    expect(sqlState(error)).toBe("23514");
  });

  it("sets the 3s lock and 5s statement timeouts only inside the transaction", async () => {
    const { tenantId } = await company("soylent");
    const inside = await runInTenantTransaction(
      runtime,
      tenantId,
      (tx) =>
        tx.$queryRaw<{ lock: string; statement: string }[]>`
        SELECT current_setting('lock_timeout') AS lock, current_setting('statement_timeout') AS statement`,
    );
    const outside = await runtime.$queryRaw<{ lock: string; statement: string }[]>`
      SELECT current_setting('lock_timeout') AS lock, current_setting('statement_timeout') AS statement`;

    expect(inside).toEqual([{ lock: "3s", statement: "5s" }]);
    expect(outside).toEqual([{ lock: "0", statement: "0" }]);
  });
});
