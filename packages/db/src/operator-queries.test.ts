import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createPrismaOperatorQueries } from "./operator-queries";
import { asTenant, createMember, createRoom, createTenant, TEST_FACILITY_ID } from "./testing/fixtures";

const urls = inject("databaseUrls");
const owner = createDatabaseClient(urls.ownerUrl);
const operator = createDatabaseClient(urls.operatorUrl);
const queries = createPrismaOperatorQueries(operator);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), operator.$disconnect()]);
});

const NOW = new Date("2030-06-15T12:00:00Z");
const day = (offset: number, hour = 10) => new Date(Date.UTC(2030, 5, 15 + offset, hour));

async function company(name: string) {
  const tenantId = await createTenant(owner, name);
  return { tenantId, bookedBy: await createMember(owner, tenantId) };
}

async function store(
  c: { tenantId: string; bookedBy: string },
  roomId: string,
  startsAt: Date,
  status: "confirmed" | "cancelled" = "confirmed",
) {
  const id = `booking-${crypto.randomUUID()}`;
  await asTenant(owner, c.tenantId, (tx) =>
    tx.booking.create({
      data: {
        id,
        ...c,
        roomId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        status,
        ...(status === "cancelled" ? { cancelledAt: NOW } : {}),
      },
    }),
  );
  return id;
}

const page = (query: Partial<Parameters<typeof queries.listBookings>[0]> & { roomId: string }) =>
  queries.listBookings({
    filter: { roomId: query.roomId, ...query.filter },
    after: null,
    limit: 50,
    now: NOW,
    ...query,
  });

describe("the operator bookings list on the operator login (spec 0004, AC-10)", () => {
  it("lists every company's bookings with the company name, upcoming first then past", async () => {
    const [a, b] = [await company("list-a"), await company("list-b")];
    const roomId = await createRoom(owner);
    const past1 = await store(a, roomId, day(-3));
    const past2 = await store(b, roomId, day(-1));
    const up2 = await store(b, roomId, day(2));
    const up1 = await store(a, roomId, day(1));

    const rows = await page({ roomId });

    expect(rows.map((row) => row.id)).toEqual([up1, up2, past2, past1]);
    expect(rows[0]?.company.name).toBe("list-a");
    expect(rows[1]?.company.name).toBe("list-b");
    expect(rows[0]?.room.timeZone).toBe("America/Argentina/Buenos_Aires");
  });

  it("pages through both runs without repeating or skipping a booking", async () => {
    const a = await company("page");
    const roomId = await createRoom(owner);
    const ids = [
      await store(a, roomId, day(1)),
      await store(a, roomId, day(2)),
      await store(a, roomId, day(-1)),
      await store(a, roomId, day(-2)),
      await store(a, roomId, day(-3)),
    ];

    const seen: string[] = [];
    let after: Parameters<typeof queries.listBookings>[0]["after"] = null;
    for (let turn = 0; turn < 5; turn++) {
      const rows = await queries.listBookings({ filter: { roomId }, after, limit: 3, now: NOW });
      const taken = rows.slice(0, 2);
      seen.push(...taken.map((row) => row.id));
      const last = taken.at(-1);
      if (rows.length <= 2 || !last) break;
      after = { now: NOW, run: last.endsAt > NOW ? "upcoming" : "past", startsAt: last.startsAt, id: last.id };
    }
    expect(seen).toEqual(ids);
  });

  it("filters by company, status, facility and a half open range of start times", async () => {
    const [a, b] = [await company("flt-a"), await company("flt-b")];
    const roomId = await createRoom(owner);
    const mine = await store(a, roomId, day(1));
    const cancelled = await store(a, roomId, day(2), "cancelled");
    const theirs = await store(b, roomId, day(3));

    const ids = async (filter: Parameters<typeof queries.listBookings>[0]["filter"]) =>
      (await queries.listBookings({ filter: { roomId, ...filter }, after: null, limit: 50, now: NOW })).map(
        (row) => row.id,
      );

    expect(await ids({ companyId: a.tenantId })).toEqual([mine, cancelled]);
    expect(await ids({ status: "cancelled" })).toEqual([cancelled]);
    expect(await ids({ facilityId: TEST_FACILITY_ID })).toEqual([mine, cancelled, theirs]);
    expect(await ids({ facilityId: "facility-none" })).toEqual([]);
    expect(await ids({ from: day(2), to: day(3) })).toEqual([cancelled]);
  });
});
