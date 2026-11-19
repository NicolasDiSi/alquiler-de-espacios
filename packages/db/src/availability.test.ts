import { afterAll, describe, expect, inject, it } from "vitest";

import { createAvailabilityQuery } from "./availability";
import { createDatabaseClient } from "./client";
import { asTenant, at, book, createMember, createRoom, createTenant } from "./testing/fixtures";
import { randomUUID } from "node:crypto";

const urls = inject("databaseUrls");
const owner = createDatabaseClient(urls.ownerUrl);
const runtime = createDatabaseClient(urls.runtimeUrl);
const operator = createDatabaseClient(urls.operatorUrl);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect(), operator.$disconnect()]);
});

type Busy = { starts_at: Date; ends_at: Date; kind: string };

/** What a company sees: the busy intervals of a room, asked from inside that company's tenant transaction. */
function busyAsCompany(tenantId: string, roomId: string, from: Date, to: Date): Promise<Busy[]> {
  return asTenant(
    runtime,
    tenantId,
    (tx) => tx.$queryRaw<Busy[]>`SELECT * FROM room_busy_intervals(${roomId}, ${from}, ${to})`,
  );
}

async function company(name: string) {
  const tenantId = await createTenant(owner, name);
  return { tenantId, bookedBy: await createMember(owner, tenantId) };
}

describe("room availability (room_busy_intervals, spec 0001 P-4)", () => {
  it("shows a company that a room is taken by another company, without saying who", async () => {
    const [a, b] = [await company("av-a"), await company("av-b")];
    const roomId = await createRoom(owner);
    await book(runtime, { ...a, roomId, startsAt: at(10), endsAt: at(12) });

    // Company B cannot read A's booking...
    await expect(asTenant(runtime, b.tenantId, (tx) => tx.booking.findMany({ where: { roomId } }))).resolves.toEqual(
      [],
    );
    // ...but sees that the room is busy, with the times and nothing else.
    const busy = await busyAsCompany(b.tenantId, roomId, at(8), at(20));
    expect(busy).toEqual([{ starts_at: at(10), ends_at: at(12), kind: "booked" }]);
    expect(Object.keys(busy[0] ?? {}).sort()).toEqual(["ends_at", "kind", "starts_at"]);
  });

  it("returns every confirmed booking of the room in order, from all companies", async () => {
    const [a, b] = [await company("av-order-a"), await company("av-order-b")];
    const roomId = await createRoom(owner);
    await book(runtime, { ...b, roomId, startsAt: at(14), endsAt: at(15) });
    await book(runtime, { ...a, roomId, startsAt: at(9), endsAt: at(10) });

    const busy = await busyAsCompany(a.tenantId, roomId, at(8), at(20));
    expect(busy.map((row) => row.starts_at)).toEqual([at(9), at(14)]);
  });

  it("leaves out cancelled bookings and other rooms", async () => {
    const a = await company("av-skip");
    const [roomId, otherRoom] = [await createRoom(owner), await createRoom(owner)];
    const cancelled = await book(runtime, { ...a, roomId, startsAt: at(9), endsAt: at(10) });
    await asTenant(runtime, a.tenantId, (tx) =>
      tx.booking.update({ where: { id: cancelled }, data: { status: "cancelled", cancelledAt: new Date() } }),
    );
    await book(runtime, { ...a, roomId: otherRoom, startsAt: at(11), endsAt: at(12) });

    await expect(busyAsCompany(a.tenantId, roomId, at(8), at(20))).resolves.toEqual([]);
  });

  it("uses a half open range: a booking that ends when the window starts is not in it", async () => {
    const a = await company("av-edge");
    const roomId = await createRoom(owner);
    await book(runtime, { ...a, roomId, startsAt: at(9), endsAt: at(10) });
    await book(runtime, { ...a, roomId, startsAt: at(12), endsAt: at(13) });

    expect(await busyAsCompany(a.tenantId, roomId, at(10), at(12))).toEqual([]);
    expect(await busyAsCompany(a.tenantId, roomId, at(9, 30), at(12, 30))).toHaveLength(2);
  });

  it("returns nothing for a room that does not exist", async () => {
    const a = await company("av-unknown");
    await expect(busyAsCompany(a.tenantId, "room-that-does-not-exist", at(8), at(20))).resolves.toEqual([]);
  });

  it("is available to the operator login too", async () => {
    const a = await company("av-operator");
    const roomId = await createRoom(owner);
    await book(runtime, { ...a, roomId, startsAt: at(10), endsAt: at(11) });

    const busy = await operator.$queryRaw<Busy[]>`SELECT * FROM room_busy_intervals(${roomId}, ${at(8)}, ${at(20)})`;
    expect(busy).toEqual([{ starts_at: at(10), ends_at: at(11), kind: "booked" }]);
  });

  it("runs as the availability owner, not as the caller, and its search path is fixed", async () => {
    const rows = await owner.$queryRaw<{ owner: string; secdef: boolean; config: string[] | null }[]>`
      SELECT pg_get_userbyid(proowner) AS owner, prosecdef AS secdef, proconfig AS config
      FROM pg_proc WHERE proname = 'room_busy_intervals'`;
    expect(rows).toEqual([
      { owner: "espacios_availability", secdef: true, config: ["search_path=pg_catalog, pg_temp"] },
    ]);
  });
});

describe("every room's busy time (rooms_busy_intervals, spec 0008)", () => {
  /** A sede of its own, so its blocks never touch another test's rooms. */
  async function facility() {
    const id = `facility-${randomUUID()}`;
    await owner.facility.create({
      data: {
        id,
        name: id,
        timeZone: "America/Argentina/Buenos_Aires",
        opensAt: 0,
        closesAt: 1440,
        openWeekdays: [0, 1, 2, 3, 4, 5, 6],
      },
    });
    return id;
  }
  const busyOf = (tenantId: string, from: Date, to: Date, roomId?: string) =>
    asTenant(runtime, tenantId, (tx) => createAvailabilityQuery(tx).busyIntervals(from, to, roomId));

  it("marks only the caller's own bookings as mine, and never says whose the others are", async () => {
    const [a, b] = [await company("rbi-a"), await company("rbi-b")];
    const roomId = await createRoom(owner);
    await book(runtime, { ...a, roomId, startsAt: at(9), endsAt: at(10) });
    await book(runtime, { ...b, roomId, startsAt: at(11), endsAt: at(12) });

    const seenByA = await busyOf(a.tenantId, at(8), at(20), roomId);
    expect(seenByA).toEqual([
      { roomId, startsAt: at(9), endsAt: at(10), kind: "booked", mine: true },
      { roomId, startsAt: at(11), endsAt: at(12), kind: "booked", mine: false },
    ]);
    const seenByB = await busyOf(b.tenantId, at(8), at(20), roomId);
    expect(seenByB.map((row) => row.mine)).toEqual([false, true]);
  });

  it("reads every room of the range at once, with the room's and the whole sede's unreleased blocks", async () => {
    const a = await company("rbi-all");
    const sede = await facility();
    const [first, second] = [await createRoom(owner, sede), await createRoom(owner, sede)];
    const operatorUser = await owner.appUser.create({
      data: { id: `user-${randomUUID()}`, name: "op", role: "operator" },
    });
    const block = (roomId: string | null, startsAt: Date, endsAt: Date, releasedAt: Date | null = null) =>
      owner.block.create({
        data: {
          id: `block-${randomUUID()}`,
          facilityId: sede,
          roomId,
          startsAt,
          endsAt,
          reason: "x",
          createdBy: operatorUser.id,
          releasedAt,
        },
      });
    await book(runtime, { ...a, roomId: first, startsAt: at(9), endsAt: at(10) });
    const cancelled = await book(runtime, { ...a, roomId: second, startsAt: at(9), endsAt: at(10) });
    await asTenant(runtime, a.tenantId, (tx) =>
      tx.booking.update({ where: { id: cancelled }, data: { status: "cancelled", cancelledAt: new Date() } }),
    );
    await block(second, at(13), at(14));
    await block(null, at(16), at(17));
    await block(first, at(18), at(19), at(17, 30));

    const busy = (await busyOf(a.tenantId, at(8), at(20))).filter(
      (row) => row.roomId === first || row.roomId === second,
    );
    const of = (roomId: string) => busy.filter((row) => row.roomId === roomId).map((row) => [row.startsAt, row.kind]);
    expect(of(first)).toEqual([
      [at(9), "booked"],
      [at(16), "blocked"],
    ]);
    expect(of(second)).toEqual([
      [at(13), "blocked"],
      [at(16), "blocked"],
    ]);
  });

  it("marks nothing as mine outside a tenant transaction (the operator login)", async () => {
    const a = await company("rbi-operator");
    const roomId = await createRoom(owner);
    await book(runtime, { ...a, roomId, startsAt: at(10), endsAt: at(11) });
    const rows = await operator.$queryRaw<
      { mine: boolean }[]
    >`SELECT mine FROM rooms_busy_intervals(${at(8)}, ${at(20)}, ${roomId})`;
    expect(rows).toEqual([{ mine: false }]);
  });
});
