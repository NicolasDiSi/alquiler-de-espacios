import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { asTenant, at, createMember, createRoom, createTenant, TEST_FACILITY_ID } from "./testing/fixtures";
import { sqlStateOf } from "./testing/sql-state";

const urls = inject("databaseUrls");
const owner = createDatabaseClient(urls.ownerUrl);
const runtime = createDatabaseClient(urls.runtimeUrl);
const operator = createDatabaseClient(urls.operatorUrl);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect(), operator.$disconnect()]);
});

const ROOM_INACTIVE = "EB001";
const COMPANY_INACTIVE = "EB002";
const OUTSIDE_HOURS = "EB003";
const ROOM_BLOCKED = "EB004";

async function setup(label: string) {
  const tenantId = await createTenant(owner, label);
  const bookedBy = await createMember(owner, tenantId);
  const roomId = await createRoom(owner);
  return { tenantId, bookedBy, roomId };
}

/** A direct insert as the runtime login: the way a client skips the use case. The guard must still refuse it. */
function insertBooking(s: { tenantId: string; roomId: string; bookedBy: string }, startsAt: Date, endsAt: Date) {
  return asTenant(runtime, s.tenantId, (tx) =>
    tx.booking.create({ data: { id: `booking-${crypto.randomUUID()}`, ...s, startsAt, endsAt } }),
  );
}

describe("the booking guard trigger (spec 0004, P-17 and P-18)", () => {
  it("accepts a booking inside an active room, facility and company", async () => {
    const s = await setup("guard-ok");
    await expect(insertBooking(s, at(10), at(11))).resolves.toMatchObject({ roomId: s.roomId });
  });

  it("refuses a booking in a deactivated room", async () => {
    const s = await setup("guard-room");
    await operator.room.update({ where: { id: s.roomId }, data: { deactivatedAt: new Date() } });
    expect(await sqlStateOf(insertBooking(s, at(10), at(11)))).toBe(ROOM_INACTIVE);
  });

  it("refuses a booking when the facility of the room is deactivated", async () => {
    const facilityId = `facility-guard-${crypto.randomUUID()}`;
    await owner.facility.create({
      data: {
        id: facilityId,
        name: facilityId,
        timeZone: "UTC",
        opensAt: 0,
        closesAt: 1440,
        openWeekdays: [0, 1, 2, 3, 4, 5, 6],
      },
    });
    const s = { ...(await setup("guard-facility")), roomId: await createRoom(owner, facilityId) };
    await operator.facility.update({ where: { id: facilityId }, data: { deactivatedAt: new Date() } });
    expect(await sqlStateOf(insertBooking(s, at(10), at(11)))).toBe(ROOM_INACTIVE);
  });

  it("refuses a booking of a deactivated company, but that company can still cancel what it holds", async () => {
    const s = await setup("guard-company");
    const booking = await insertBooking(s, at(10), at(11));
    await operator.company.update({ where: { id: s.tenantId }, data: { deactivatedAt: new Date() } });

    expect(await sqlStateOf(insertBooking(s, at(12), at(13)))).toBe(COMPANY_INACTIVE);
    // A cancel is an UPDATE, and the guard only watches inserts.
    await expect(
      asTenant(runtime, s.tenantId, (tx) =>
        tx.booking.update({ where: { id: booking.id }, data: { status: "cancelled", cancelledAt: new Date() } }),
      ),
    ).resolves.toMatchObject({ status: "cancelled" });
  });

  describe("opening window, read from the facility", () => {
    async function roomIn(timeZone: string, opensAt: number, closesAt: number, openWeekdays: number[]) {
      const facilityId = `facility-hours-${crypto.randomUUID()}`;
      await owner.facility.create({
        data: { id: facilityId, name: facilityId, timeZone, opensAt, closesAt, openWeekdays },
      });
      return { ...(await setup("guard-hours")), roomId: await createRoom(owner, facilityId) };
    }

    it("refuses a start before opening and an end after closing", async () => {
      // 2030-01-07 is a Monday. UTC facility, open 08:00 to 20:00.
      const s = await roomIn("UTC", 480, 1200, [1, 2, 3, 4, 5]);
      expect(await sqlStateOf(insertBooking(s, at(7), at(9)))).toBe(OUTSIDE_HOURS);
      expect(await sqlStateOf(insertBooking(s, at(19), at(21)))).toBe(OUTSIDE_HOURS);
      await expect(insertBooking(s, at(8), at(9))).resolves.toBeDefined();
      await expect(insertBooking(s, at(19), at(20))).resolves.toBeDefined();
    });

    it("refuses a day the facility is closed", async () => {
      const s = await roomIn("UTC", 480, 1200, [2, 3]); // Tuesday and Wednesday only
      expect(await sqlStateOf(insertBooking(s, at(10), at(11)))).toBe(OUTSIDE_HOURS);
    });

    it("reads the hours in the facility's own time zone", async () => {
      // 10:00 UTC is 07:00 in Buenos Aires (before 08:00) and 19:00 in Tokyo (before 20:00).
      const buenosAires = await roomIn("America/Argentina/Buenos_Aires", 480, 1200, [1]);
      expect(await sqlStateOf(insertBooking(buenosAires, at(10), at(11)))).toBe(OUTSIDE_HOURS);
      await expect(insertBooking(buenosAires, at(12), at(13))).resolves.toBeDefined();
      const tokyo = await roomIn("Asia/Tokyo", 480, 1200, [1]);
      await expect(insertBooking(tokyo, at(10), at(11))).resolves.toBeDefined();
    });

    it("refuses a booking that crosses midnight of the facility's day", async () => {
      const s = await roomIn("UTC", 0, 1440, [0, 1, 2, 3, 4, 5, 6]);
      expect(await sqlStateOf(insertBooking(s, at(23), new Date(at(23).getTime() + 2 * 3_600_000)))).toBe(
        OUTSIDE_HOURS,
      );
      await expect(insertBooking(s, at(22), at(24))).resolves.toBeDefined(); // ends exactly at 24:00
    });
  });

  describe("blocks", () => {
    async function block(roomId: string | null, startsAt: Date, endsAt: Date, createdBy: string) {
      return operator.block.create({
        data: {
          id: `block-${crypto.randomUUID()}`,
          facilityId: TEST_FACILITY_ID,
          roomId,
          startsAt,
          endsAt,
          reason: "x",
          createdBy,
        },
      });
    }

    it("refuses a booking over a block of its room, and accepts the neighbours", async () => {
      const s = await setup("guard-block");
      await block(s.roomId, at(10), at(12), s.bookedBy);
      expect(await sqlStateOf(insertBooking(s, at(11), at(13)))).toBe(ROOM_BLOCKED);
      await expect(insertBooking(s, at(8), at(10))).resolves.toBeDefined(); // ends where the block starts
      await expect(insertBooking(s, at(12), at(13))).resolves.toBeDefined();
    });

    it("lets a booking through once the block is released", async () => {
      const s = await setup("guard-release");
      const blocked = await block(s.roomId, at(10), at(12), s.bookedBy);
      await operator.block.update({ where: { id: blocked.id }, data: { releasedAt: new Date() } });
      await expect(insertBooking(s, at(10), at(11))).resolves.toBeDefined();
    });

    it("a block without a room closes every room of the facility", async () => {
      const facilityId = `facility-closed-${crypto.randomUUID()}`;
      await owner.facility.create({
        data: {
          id: facilityId,
          name: facilityId,
          timeZone: "UTC",
          opensAt: 0,
          closesAt: 1440,
          openWeekdays: [0, 1, 2, 3, 4, 5, 6],
        },
      });
      const s = { ...(await setup("guard-closure")), roomId: await createRoom(owner, facilityId) };
      const otherFacilityRoom = await createRoom(owner);
      await operator.block.create({
        data: {
          id: `block-${crypto.randomUUID()}`,
          facilityId,
          roomId: null,
          startsAt: at(0),
          endsAt: at(24),
          reason: "feriado",
          createdBy: s.bookedBy,
        },
      });
      expect(await sqlStateOf(insertBooking(s, at(10), at(11)))).toBe(ROOM_BLOCKED);
      // Another facility is not affected.
      await expect(insertBooking({ ...s, roomId: otherFacilityRoom }, at(10), at(11))).resolves.toBeDefined();
    });
  });

  it("makes a deactivation wait for a booking in flight (the lock behind P-16)", async () => {
    const s = await setup("guard-race");
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted!: () => void;
    const insertedSignal = new Promise<void>((resolve) => {
      inserted = resolve;
    });

    // A booking is inserted and not committed yet: its trigger holds the room FOR SHARE.
    const inFlight = asTenant(runtime, s.tenantId, async (tx) => {
      await tx.booking.create({
        data: { id: `booking-${crypto.randomUUID()}`, ...s, startsAt: at(10), endsAt: at(11) },
      });
      inserted();
      await held;
    });
    await insertedSignal;

    // The operator's deactivation cannot take the row while that happens (a short lock timeout shows the wait).
    const blocked = operator.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '300ms'`;
      await tx.room.update({ where: { id: s.roomId }, data: { deactivatedAt: new Date() } });
    });
    expect(await sqlStateOf(blocked)).toBe("55P03");

    release();
    await inFlight;
    // Once the booking is committed the deactivation goes through, and is able to count it first.
    await expect(
      operator.room.update({ where: { id: s.roomId }, data: { deactivatedAt: new Date() } }),
    ).resolves.toBeDefined();
  });

  it("makes a block wait for a booking in flight, and refuses what arrives after it (P-18)", async () => {
    const s = await setup("guard-block-race");
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted!: () => void;
    const insertedSignal = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    const inFlight = asTenant(runtime, s.tenantId, async (tx) => {
      await tx.booking.create({
        data: { id: `booking-${crypto.randomUUID()}`, ...s, startsAt: at(10), endsAt: at(11) },
      });
      inserted();
      await held;
    });
    await insertedSignal;

    // Creating a block locks the facility row FOR UPDATE; the in flight insert holds it FOR SHARE, so it waits.
    const blocked = operator.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '300ms'`;
      await tx.$queryRaw`SELECT id FROM facility WHERE id = ${TEST_FACILITY_ID} FOR UPDATE`;
    });
    expect(await sqlStateOf(blocked)).toBe("55P03");

    release();
    await inFlight;
    await operator.block.create({
      data: {
        id: `block-${crypto.randomUUID()}`,
        facilityId: TEST_FACILITY_ID,
        roomId: s.roomId,
        startsAt: at(10),
        endsAt: at(11),
        reason: "x",
        createdBy: s.bookedBy,
      },
    });
    expect(await sqlStateOf(insertBooking(s, at(10), at(11)))).toBe(ROOM_BLOCKED);
  });
});
