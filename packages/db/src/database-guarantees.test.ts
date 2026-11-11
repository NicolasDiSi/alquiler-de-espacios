import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { sqlState } from "./sql-state";
import { asTenant, at, book, createMember, createRoom, createTenant } from "./testing/fixtures";
import { sqlStateOf } from "./testing/sql-state";

const urls = inject("databaseUrls");
const owner = createDatabaseClient(urls.ownerUrl);
// One connection, so a setting that leaked from one statement would be visible to the next one.
const runtime = createDatabaseClient(`${urls.runtimeUrl}?connection_limit=1`);
// The pool the concurrency proof needs: several connections at once.
const pool = createDatabaseClient(urls.runtimeUrl);
// Sees every company, so a count here does not depend on the isolation being proven in the same test.
const operator = createDatabaseClient(urls.operatorUrl);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect(), pool.$disconnect(), operator.$disconnect()]);
});

async function company(name: string) {
  const tenantId = await createTenant(owner, name);
  return { tenantId, bookedBy: await createMember(owner, tenantId) };
}

describe("tenant isolation (row level security, spec 0001 P-3)", () => {
  it("shows no booking when no tenant is set", async () => {
    const a = await company("rls-none");
    const roomId = await createRoom(owner);
    await book(runtime, { ...a, roomId, startsAt: at(9), endsAt: at(10) });

    await expect(runtime.booking.findMany({ where: { roomId } })).resolves.toEqual([]);
  });

  it("shows no booking when the tenant setting is empty", async () => {
    const a = await company("rls-empty");
    const roomId = await createRoom(owner);
    await book(runtime, { ...a, roomId, startsAt: at(9), endsAt: at(10) });

    const rows = await asTenant(runtime, "", (tx) => tx.booking.findMany({ where: { roomId } }));
    expect(rows).toEqual([]);
  });

  it("shows a company only its own bookings", async () => {
    const [a, b] = [await company("rls-a"), await company("rls-b")];
    const roomId = await createRoom(owner);
    const idA = await book(runtime, { ...a, roomId, startsAt: at(9), endsAt: at(10) });
    const idB = await book(runtime, { ...b, roomId, startsAt: at(11), endsAt: at(12) });

    const seenByA = await asTenant(runtime, a.tenantId, (tx) => tx.booking.findMany({ where: { roomId } }));
    const seenByB = await asTenant(runtime, b.tenantId, (tx) => tx.booking.findMany({ where: { roomId } }));
    expect(seenByA.map((row) => row.id)).toEqual([idA]);
    expect(seenByB.map((row) => row.id)).toEqual([idB]);
  });

  it("does not let a company read, change or cancel another company's booking, even by id", async () => {
    const [a, b] = [await company("rls-own"), await company("rls-intruder")];
    const roomId = await createRoom(owner);
    const id = await book(runtime, { ...a, roomId, startsAt: at(9), endsAt: at(10) });

    await expect(asTenant(runtime, b.tenantId, (tx) => tx.booking.findUnique({ where: { id } }))).resolves.toBeNull();
    const update = await asTenant(runtime, b.tenantId, (tx) =>
      tx.booking.updateMany({ where: { id }, data: { status: "cancelled", cancelledAt: new Date() } }),
    );
    expect(update.count).toBe(0);
    await expect(operatorView(id)).resolves.toMatchObject({ status: "confirmed", cancelledAt: null });
  });

  it("refuses to insert a booking for another company (WITH CHECK)", async () => {
    const [a, b] = [await company("rls-check-a"), await company("rls-check-b")];
    const roomId = await createRoom(owner);

    const forged = asTenant(runtime, a.tenantId, (tx) =>
      tx.booking.create({
        data: { id: "forged", tenantId: b.tenantId, roomId, bookedBy: b.bookedBy, startsAt: at(9), endsAt: at(10) },
      }),
    );
    expect(await sqlStateOf(forged)).toBe("42501");
  });

  it("applies to the schema owner too (FORCE ROW LEVEL SECURITY)", async () => {
    const a = await company("rls-force");
    const roomId = await createRoom(owner);
    const id = await book(owner, { ...a, roomId, startsAt: at(9), endsAt: at(10) });

    await expect(owner.booking.findMany({ where: { roomId } })).resolves.toEqual([]);
    const own = await asTenant(owner, a.tenantId, (tx) => tx.booking.findMany({ where: { roomId } }));
    expect(own.map((row) => row.id)).toEqual([id]);
  });

  it("does not leak the tenant setting out of the transaction", async () => {
    const a = await company("rls-leak");
    await asTenant(runtime, a.tenantId, async () => undefined);
    const [row] = await runtime.$queryRaw<
      { value: string | null }[]
    >`SELECT current_setting('app.tenant_id', true) AS value`;
    expect(row?.value ?? "").toBe("");
  });
});

/** Reads a booking through the operator login, which sees every company, to prove its state after a refused change. */
function operatorView(id: string) {
  return operator.booking.findUniqueOrThrow({ where: { id } });
}

describe("no overlapping bookings (exclusion constraint, spec 0001 P-1 and P-2)", () => {
  it("refuses an exact repeat, a partial overlap and a contained booking, across companies", async () => {
    const [a, b] = [await company("ov-a"), await company("ov-b")];
    const roomId = await createRoom(owner);
    await book(runtime, { ...a, roomId, startsAt: at(10), endsAt: at(12) });

    for (const [startsAt, endsAt] of [
      [at(10), at(12)], // the exact same slot
      [at(11), at(13)], // starts inside, ends after
      [at(9), at(11)], // starts before, ends inside
      [at(10, 30), at(11, 30)], // contained
      [at(9), at(13)], // contains it
    ] as const) {
      const attempt = book(runtime, { ...b, roomId, startsAt, endsAt });
      expect(await sqlStateOf(attempt)).toBe("23P01");
    }
  });

  it("allows adjacent bookings, before and after (the range is half open)", async () => {
    const [a, b] = [await company("adj-a"), await company("adj-b")];
    const roomId = await createRoom(owner);
    await book(runtime, { ...a, roomId, startsAt: at(10), endsAt: at(11) });

    await expect(book(runtime, { ...b, roomId, startsAt: at(11), endsAt: at(12) })).resolves.toBeTruthy();
    await expect(book(runtime, { ...b, roomId, startsAt: at(9), endsAt: at(10) })).resolves.toBeTruthy();
  });

  it("allows the same time in another room", async () => {
    const a = await company("room-a");
    const [first, second] = [await createRoom(owner), await createRoom(owner)];
    await book(runtime, { ...a, roomId: first, startsAt: at(10), endsAt: at(11) });

    await expect(book(runtime, { ...a, roomId: second, startsAt: at(10), endsAt: at(11) })).resolves.toBeTruthy();
  });

  it("frees the slot when a booking is cancelled, for any company", async () => {
    const [a, b] = [await company("cancel-a"), await company("cancel-b")];
    const roomId = await createRoom(owner);
    const id = await book(runtime, { ...a, roomId, startsAt: at(10), endsAt: at(11) });
    expect(await sqlStateOf(book(runtime, { ...b, roomId, startsAt: at(10), endsAt: at(11) }))).toBe("23P01");

    await asTenant(runtime, a.tenantId, (tx) =>
      tx.booking.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date() } }),
    );

    await expect(book(runtime, { ...b, roomId, startsAt: at(10), endsAt: at(11) })).resolves.toBeTruthy();
  });

  it("does not reveal the other company's booking in the refusal", async () => {
    const [a, b] = [await company("leak-a"), await company("leak-b")];
    const roomId = await createRoom(owner);
    const id = await book(runtime, { ...a, roomId, startsAt: at(10), endsAt: at(11) });

    const error = await book(runtime, { ...b, roomId, startsAt: at(10), endsAt: at(11) }).catch((caught) => caught);
    expect(sqlState(error)).toBe("23P01"); // there must be a refusal to inspect
    const text = JSON.stringify({ message: error.message, meta: error.meta });
    expect(text).not.toContain(a.tenantId);
    expect(text).not.toContain(a.bookedBy);
    expect(text).not.toContain(id);
  });

  it("lets exactly one of several simultaneous requests for one slot win", async () => {
    const companies = await Promise.all(["race-a", "race-b", "race-c", "race-d"].map(company));
    const roomId = await createRoom(owner);

    // Eight requests at once on eight connections, two per company, all for the same room and time.
    const results = await Promise.allSettled(
      companies.flatMap((c) => [0, 1].map(() => book(pool, { ...c, roomId, startsAt: at(14), endsAt: at(15) }))),
    );

    const won = results.filter((result) => result.status === "fulfilled");
    const lost = results.filter((result) => result.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(7);
    for (const result of lost) {
      const state = await sqlStateOf(Promise.reject((result as PromiseRejectedResult).reason));
      expect(state).toBe("23P01");
    }
    await expect(operator.booking.count({ where: { roomId } })).resolves.toBe(1);
  });
});

describe("rules every row must satisfy (CHECK constraints)", () => {
  it("refuses a booking that ends before or when it starts", async () => {
    const a = await company("check-period");
    const roomId = await createRoom(owner);

    expect(await sqlStateOf(book(runtime, { ...a, roomId, startsAt: at(11), endsAt: at(10) }))).toBe("23514");
    expect(await sqlStateOf(book(runtime, { ...a, roomId, startsAt: at(11), endsAt: at(11) }))).toBe("23514");
  });

  it("requires cancelled_at exactly when the booking is cancelled", async () => {
    const a = await company("check-cancel");
    const roomId = await createRoom(owner);
    const id = await book(runtime, { ...a, roomId, startsAt: at(9), endsAt: at(10) });

    const withoutDate = asTenant(runtime, a.tenantId, (tx) =>
      tx.booking.update({ where: { id }, data: { status: "cancelled" } }),
    );
    expect(await sqlStateOf(withoutDate)).toBe("23514");
    const stray = asTenant(runtime, a.tenantId, (tx) =>
      tx.booking.update({ where: { id }, data: { cancelledAt: new Date() } }),
    );
    expect(await sqlStateOf(stray)).toBe("23514");
  });

  it("gives a member a company and the operator none", async () => {
    const tenantId = await createTenant(owner, "check-user");

    const memberWithout = owner.appUser.create({ data: { id: "m-without", name: "x", role: "member" } });
    expect(await sqlStateOf(memberWithout)).toBe("23514");
    const operatorWith = owner.appUser.create({ data: { id: "o-with", tenantId, name: "x", role: "operator" } });
    expect(await sqlStateOf(operatorWith)).toBe("23514");
    await expect(
      owner.appUser.create({ data: { id: `o-${tenantId}`, name: "x", role: "operator" } }),
    ).resolves.toBeTruthy();
  });
});
