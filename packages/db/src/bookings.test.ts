import { bookRoom, createBlock, listMyBookings } from "@espacios/application";
import { type Actor, type LocalDate, type TenantId, type UserId, zonedInstant } from "@espacios/domain";
import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createUuidV7Generator } from "./ids";
import { createPrismaOperatorCatalog } from "./operator-catalog";
import { createPrismaRoomCatalog } from "./room-catalog";
import {
  asTenant,
  book,
  createMember,
  createRoom,
  createTenant,
  RACE_WAITS,
  TEST_FACILITY_ID,
} from "./testing/fixtures";
import { oneWinner, resultOutcomes } from "./testing/outcomes";
import { createPrismaUnitOfWork } from "./unit-of-work";

const urls = inject("databaseUrls");
const owner = createDatabaseClient(urls.ownerUrl);
// The pool the app uses: the concurrency proofs need several connections at once (P-1 keeps N under its size).
const runtime = createDatabaseClient(urls.runtimeUrl);
const operator = createDatabaseClient(urls.operatorUrl);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect(), operator.$disconnect()]);
});

const at = (date: string, hours: number, minutes = 0) =>
  zonedInstant(date as LocalDate, hours * 60 + minutes, "America/Argentina/Buenos_Aires");

// Monday 2030-01-07, 09:00 in Buenos Aires. Bookings go on Tuesday the 8th.
const NOW = at("2030-01-07", 9);
const DAY = "2030-01-08";

const deps = {
  // The production timeouts, with longer waits for a connection: the suites share one container (RACE_WAITS).
  uow: createPrismaUnitOfWork(runtime, RACE_WAITS),
  clock: { now: () => NOW },
  ids: createUuidV7Generator(),
  rooms: createPrismaRoomCatalog(runtime),
};

async function member(name: string): Promise<Actor & { role: "member" }> {
  const tenantId = await createTenant(owner, name);
  const userId = (await createMember(owner, tenantId)) as UserId;
  return { role: "member", tenantId, userId };
}

const slot = (roomId: string, from: number, to: number) => ({ roomId, startsAt: at(DAY, from), endsAt: at(DAY, to) });

/** Every confirmed booking of a room, across companies (the operator login bypasses row level security). */
const confirmedIn = (roomId: string) => operator.booking.findMany({ where: { roomId, status: "confirmed" } });

describe("bookRoom against Postgres (runtime login, RLS on)", () => {
  it("stores the booking under the member's company, booked by the member", async () => {
    const ana = await member("book-store");
    const roomId = await createRoom(owner);

    const result = await bookRoom(deps, ana, slot(roomId, 10, 11));

    expect(result).toMatchObject({
      ok: true,
      value: {
        created: true,
        booking: { room: { id: roomId }, startsAt: `${DAY}T10:00:00-03:00`, status: "confirmed", phase: "upcoming" },
      },
    });
    expect(await confirmedIn(roomId)).toMatchObject([{ tenantId: ana.tenantId, bookedBy: ana.userId }]);
  });

  it("gives exactly one success to N companies booking one slot at once (P-1)", async () => {
    const roomId = await createRoom(owner);
    const companies = await Promise.all(Array.from({ length: 8 }, (_, index) => member(`race-${index}`)));

    const results = await Promise.all(companies.map((actor) => bookRoom(deps, actor, slot(roomId, 10, 11))));

    // Strict: the app's `INSERT ... ON CONFLICT DO NOTHING` waits for an in flight overlap instead of deadlocking.
    expect(resultOutcomes(results)).toEqual(oneWinner(8, "conflict"));
    // A refusal is the reason alone: no company, user, booking id or times of the winner.
    for (const refusal of results.filter((result) => !result.ok))
      expect(refusal).toEqual({ ok: false, reason: "conflict" });
    expect(await confirmedIn(roomId)).toHaveLength(1);
  });

  it("refuses a partial overlap, allows an adjacent booking, and rebooks a cancelled slot (P-2)", async () => {
    const [a, b] = [await member("p2-a"), await member("p2-b")];
    const roomId = await createRoom(owner);
    const first = await bookRoom(deps, a, slot(roomId, 10, 12));

    await expect(bookRoom(deps, b, slot(roomId, 11, 13))).resolves.toEqual({ ok: false, reason: "conflict" });
    await expect(bookRoom(deps, b, slot(roomId, 12, 13))).resolves.toMatchObject({ ok: true });

    // Cancelling is feature 7; here the row is cancelled directly, the way that use case will.
    const id = first.ok ? first.value.booking.id : "";
    await asTenant(owner, a.tenantId, (tx) =>
      tx.booking.update({ where: { id }, data: { status: "cancelled", cancelledAt: NOW } }),
    );
    await expect(bookRoom(deps, b, slot(roomId, 10, 12))).resolves.toMatchObject({ ok: true });
  });

  it("answers a double submit by one company with one new booking and its repeat (P-11)", async () => {
    const [ana, gus] = [await member("p11-a"), await member("p11-b")];
    const beto = { ...ana, userId: (await createMember(owner, ana.tenantId)) as UserId };
    const roomId = await createRoom(owner);

    const [one, two] = await Promise.all([
      bookRoom(deps, ana, slot(roomId, 14, 15)),
      bookRoom(deps, beto, slot(roomId, 14, 15)),
    ]);

    if (!one.ok || !two.ok) throw new Error(`both should succeed: ${JSON.stringify([one, two])}`);
    expect([one.value.created, two.value.created].sort()).toEqual([false, true]);
    expect(one.value.booking.id).toBe(two.value.booking.id);
    expect(await confirmedIn(roomId)).toHaveLength(1);

    await expect(bookRoom(deps, gus, slot(roomId, 14, 15))).resolves.toEqual({ ok: false, reason: "conflict" });
  });

  it("returns not_found for an unknown room and writes nothing", async () => {
    const ana = await member("book-no-room");
    const result = await bookRoom(deps, ana, slot("room-that-does-not-exist", 10, 11));
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("listMyBookings against Postgres", () => {
  async function seedViews(actor: Actor & { role: "member" }, roomId: string) {
    const bookedBy = actor.userId;
    const tenantId: TenantId = actor.tenantId;
    const ids = {
      lastWeek: await book(owner, {
        tenantId,
        roomId,
        bookedBy,
        startsAt: at("2029-12-31", 10),
        endsAt: at("2029-12-31", 11),
      }),
      earlyToday: await book(owner, {
        tenantId,
        roomId,
        bookedBy,
        startsAt: at("2030-01-07", 8),
        endsAt: at("2030-01-07", 9),
      }),
      // Another room: it overlaps earlyToday.
      inProgress: await book(owner, {
        tenantId,
        roomId: await createRoom(owner),
        bookedBy,
        startsAt: at("2030-01-07", 8, 30),
        endsAt: at("2030-01-07", 9, 30),
      }),
      tomorrow: await book(owner, { tenantId, roomId, bookedBy, startsAt: at(DAY, 10), endsAt: at(DAY, 11) }),
      later: await book(owner, { tenantId, roomId, bookedBy, startsAt: at(DAY, 16), endsAt: at(DAY, 17) }),
    };
    const cancelled = await book(owner, { tenantId, roomId, bookedBy, startsAt: at(DAY, 12), endsAt: at(DAY, 13) });
    await asTenant(owner, tenantId, (tx) =>
      tx.booking.update({ where: { id: cancelled }, data: { status: "cancelled", cancelledAt: NOW } }),
    );
    return { ...ids, cancelled };
  }

  const list = async (
    actor: Actor,
    view: "upcoming" | "past" | "cancelled",
    after = null as null | { startsAt: Date; id: string },
    limit = 50,
  ) => {
    const result = await listMyBookings(deps, actor, { view, after, limit });
    if (!result.ok) throw new Error(result.reason);
    return result.value;
  };

  it("splits the company's bookings into upcoming, past and cancelled, each in its order (spec 0003)", async () => {
    const ana = await member("views");
    const ids = await seedViews(ana, await createRoom(owner));

    const upcoming = await list(ana, "upcoming");
    expect(upcoming.bookings.map((booking) => booking.id)).toEqual([ids.inProgress, ids.tomorrow, ids.later]);
    expect(upcoming.bookings.map((booking) => booking.phase)).toEqual(["in_progress", "upcoming", "upcoming"]);
    // Ends exactly now: already past.
    expect((await list(ana, "past")).bookings.map((booking) => booking.id)).toEqual([ids.earlyToday, ids.lastWeek]);
    const cancelled = await list(ana, "cancelled");
    expect(cancelled.bookings).toMatchObject([
      { id: ids.cancelled, phase: "cancelled", cancelledAt: "2030-01-07T09:00:00-03:00" },
    ]);
  });

  it("pages through a view with the keyset position, without repeats or gaps", async () => {
    const ana = await member("pages");
    const ids = await seedViews(ana, await createRoom(owner));

    const first = await list(ana, "upcoming", null, 2);
    expect(first.bookings.map((booking) => booking.id)).toEqual([ids.inProgress, ids.tomorrow]);
    const second = await list(ana, "upcoming", first.next, 2);
    expect(second.bookings.map((booking) => booking.id)).toEqual([ids.later]);
    expect(second.next).toBeNull();

    const pastFirst = await list(ana, "past", null, 1);
    const pastSecond = await list(ana, "past", pastFirst.next, 1);
    expect([...pastFirst.bookings, ...pastSecond.bookings].map((booking) => booking.id)).toEqual([
      ids.earlyToday,
      ids.lastWeek,
    ]);
  });

  it("shows every member's bookings of the company and none of another company, even with its position", async () => {
    const [ana, gus] = [await member("cursor-a"), await member("cursor-b")];
    const roomId = await createRoom(owner);
    const idsA = await seedViews(ana, roomId);
    const beto = (await createMember(owner, ana.tenantId)) as UserId;
    const byBeto = await book(owner, {
      tenantId: ana.tenantId,
      roomId,
      bookedBy: beto,
      startsAt: at(DAY, 18),
      endsAt: at(DAY, 19),
    });
    const ownOfB = await book(owner, {
      tenantId: gus.tenantId,
      roomId: await createRoom(owner),
      bookedBy: gus.userId,
      startsAt: at(DAY, 9),
      endsAt: at(DAY, 10),
    });

    expect((await list(ana, "upcoming")).bookings.map((booking) => booking.id)).toContain(byBeto);

    // Company B pages with a position taken from company A's first page: it gets only its own rows.
    const pageOfA = await list(ana, "upcoming", null, 1);
    for (const view of ["upcoming", "past", "cancelled"] as const) {
      const seen = [...(await list(gus, view)).bookings, ...(await list(gus, view, pageOfA.next)).bookings].map(
        (booking) => booking.id,
      );
      for (const id of [...Object.values(idsA), byBeto]) expect(seen).not.toContain(id);
    }
    expect((await list(gus, "upcoming")).bookings.map((booking) => booking.id)).toEqual([ownOfB]);
  });
});

describe("bookRoom and the booking guard (spec 0004, AC-7 to AC-9, AC-19)", () => {
  it("refuses an inactive room with room_inactive before writing anything", async () => {
    const ana = await member("guard-room");
    const roomId = await createRoom(owner);
    await operator.room.update({ where: { id: roomId }, data: { deactivatedAt: new Date() } });

    await expect(bookRoom(deps, ana, slot(roomId, 10, 11))).resolves.toEqual({ ok: false, reason: "room_inactive" });
    expect(await confirmedIn(roomId)).toEqual([]);
  });

  it("refuses a deactivated company with company_inactive, through the database guard", async () => {
    const ana = await member("guard-company");
    const roomId = await createRoom(owner);
    await operator.company.update({ where: { id: ana.tenantId }, data: { deactivatedAt: new Date() } });

    await expect(bookRoom(deps, ana, slot(roomId, 10, 11))).resolves.toEqual({ ok: false, reason: "company_inactive" });
    expect(await confirmedIn(roomId)).toEqual([]);
  });

  it("refuses a booking over a block with room_blocked, whatever the company, and lets it through once released", async () => {
    const ana = await member("guard-block");
    const roomId = await createRoom(owner);
    const block = await operator.block.create({
      data: {
        id: `block-${crypto.randomUUID()}`,
        facilityId: TEST_FACILITY_ID,
        roomId,
        startsAt: at(DAY, 9),
        endsAt: at(DAY, 12),
        reason: "mantenimiento",
        createdBy: ana.userId,
      },
    });

    // The refusal carries the reason code only: nothing about the block (its reason, who made it, its times).
    const refused = await bookRoom(deps, ana, slot(roomId, 10, 11));
    expect(refused).toEqual({ ok: false, reason: "room_blocked" });

    await operator.block.update({ where: { id: block.id }, data: { releasedAt: new Date() } });
    await expect(bookRoom(deps, ana, slot(roomId, 10, 11))).resolves.toMatchObject({ ok: true });
  });

  it("books in the zone and hours of the room's facility", async () => {
    const ana = await member("guard-zone");
    const facilityId = `facility-tokyo-${crypto.randomUUID()}`;
    await owner.facility.create({
      data: {
        id: facilityId,
        name: facilityId,
        timeZone: "Asia/Tokyo",
        opensAt: 540,
        closesAt: 780,
        openWeekdays: [2],
      },
    });
    const roomId = await createRoom(owner, facilityId);

    // Tuesday 2030-01-08, 10:00 to 11:00 in Tokyo.
    const tokyo = { roomId, startsAt: new Date("2030-01-08T01:00:00Z"), endsAt: new Date("2030-01-08T02:00:00Z") };
    await expect(bookRoom(deps, ana, tokyo)).resolves.toMatchObject({
      ok: true,
      value: { booking: { startsAt: "2030-01-08T10:00:00+09:00" } },
    });
    // After that facility closes (13:00 Tokyo), even though it is inside Buenos Aires hours.
    const late = { roomId, startsAt: new Date("2030-01-08T05:00:00Z"), endsAt: new Date("2030-01-08T06:00:00Z") };
    await expect(bookRoom(deps, ana, late)).resolves.toEqual({ ok: false, reason: "outside_hours" });
  });
});

describe("a block racing a booking through the use cases (spec 0004, P-18)", () => {
  it("never lets both win: either the booking is kept and the block refused with it, or the block stands and the booking is refused", async () => {
    const operatorUserId = `user-operador-${crypto.randomUUID()}`;
    await owner.appUser.create({ data: { id: operatorUserId, name: operatorUserId, role: "operator" } });
    const actor: Actor = { role: "operator", userId: operatorUserId as UserId };
    const operatorDeps = {
      catalog: createPrismaOperatorCatalog(operator),
      clock: { now: () => NOW },
      ids: createUuidV7Generator(),
    };

    for (let round = 0; round < 6; round++) {
      const ana = await member(`block-race-${round}`);
      const roomId = await createRoom(owner);
      const [booked, blocked] = await Promise.all([
        bookRoom(deps, ana, slot(roomId, 10, 11)),
        createBlock(operatorDeps, actor, {
          facilityId: TEST_FACILITY_ID,
          roomId,
          startsAt: at(DAY, 9),
          endsAt: at(DAY, 12),
          reason: "mantenimiento",
        }),
      ]);

      expect(booked.ok && blocked.ok).toBe(false);
      if (booked.ok) expect(blocked).toMatchObject({ ok: false, reason: "block_has_bookings" });
      else expect(booked).toEqual({ ok: false, reason: "room_blocked" });
      expect(await confirmedIn(roomId)).toHaveLength(booked.ok ? 1 : 0);
    }
  });
});
