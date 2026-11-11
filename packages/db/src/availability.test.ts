import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { asTenant, at, book, createMember, createRoom, createTenant } from "./testing/fixtures";

const urls = inject("databaseUrls");
const owner = createDatabaseClient(urls.ownerUrl);
const runtime = createDatabaseClient(urls.runtimeUrl);
const operator = createDatabaseClient(urls.operatorUrl);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect(), operator.$disconnect()]);
});

type Busy = { starts_at: Date; ends_at: Date };

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
    expect(busy).toEqual([{ starts_at: at(10), ends_at: at(12) }]);
    expect(Object.keys(busy[0] ?? {}).sort()).toEqual(["ends_at", "starts_at"]);
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
    expect(busy).toEqual([{ starts_at: at(10), ends_at: at(11) }]);
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
