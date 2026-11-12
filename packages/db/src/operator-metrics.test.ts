import type { LocalDate } from "@espacios/domain";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createPrismaOperatorQueries } from "./operator-queries";
import { asTenant, createMember } from "./testing/fixtures";

/**
 * Metrics on a dataset whose numbers are worked out by hand (spec 0004, AC-11 to AC-14). One facility, Mon 9 to 17 in
 * Buenos Aires (UTC-3, 480 min a day), Monday 2030-01-07 and Tuesday 2030-01-08:
 *  - Room A, always active. Monday: a released block 15 to 17 cut at 16 (60 blocked), a block released before it began
 *    (no effect). Tuesday: a facility wide block 14 to 17 (180). Open 420 + 300 = 720, blocked 240, booked 120
 *    (Mon 10 to 12, company X). A cancelled booking on Tuesday never counts.
 *  - Room B, added Tuesday 00:00: open 300 (Tuesday less the block). Booked 60 (Tue 9:30 to 10:30, company Y).
 *  - Room C, deactivated Monday 13:00: open 240 on Monday, nothing on Tuesday. Never booked.
 */
const urls = inject("databaseUrls");
const owner = createDatabaseClient(urls.ownerUrl);
const queries = createPrismaOperatorQueries(createDatabaseClient(urls.operatorUrl));

const run = crypto.randomUUID().slice(0, 8);
const id = (name: string) => `${name}-${run}`;
const FACILITY = id("facility-metrics");
const TOKYO = id("facility-tokyo");
const range = { from: "2030-01-07" as LocalDate, to: "2030-01-08" as LocalDate };
const ba = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2030, 0, day, hour + 3, minute));

let x: { tenantId: string; bookedBy: string };
let y: { tenantId: string; bookedBy: string };
let idle: string;
let person: string;

async function company(name: string, kind: "company" | "individual" = "company") {
  const tenantId = id(`company-${name}`);
  await owner.company.create({ data: { id: tenantId, name: `${name}-${run}`, slug: `${name}-${run}`, kind } });
  return { tenantId, bookedBy: await createMember(owner, tenantId) };
}

async function book(
  c: { tenantId: string; bookedBy: string },
  roomId: string,
  startsAt: Date,
  endsAt: Date,
  cancelled = false,
) {
  await asTenant(owner, c.tenantId, (tx) =>
    tx.booking.create({
      data: {
        id: `booking-${crypto.randomUUID()}`,
        ...c,
        roomId,
        startsAt,
        endsAt,
        ...(cancelled ? { status: "cancelled" as const, cancelledAt: new Date("2030-01-01T00:00:00Z") } : {}),
      },
    }),
  );
}

beforeAll(async () => {
  const hours = { opensAt: 540, closesAt: 1020, openWeekdays: [1, 2, 3, 4, 5] };
  await owner.facility.create({
    data: { id: FACILITY, name: FACILITY, timeZone: "America/Argentina/Buenos_Aires", ...hours },
  });
  await owner.facility.create({ data: { id: TOKYO, name: TOKYO, timeZone: "Asia/Tokyo", ...hours } });
  const early = new Date("2029-01-01T00:00:00Z");
  const room = (name: string, facilityId: string, activeFrom: Date, deactivatedAt: Date | null = null) =>
    owner.room.create({ data: { id: id(name), name: id(name), capacity: 4, facilityId, activeFrom, deactivatedAt } });
  await room("room-a", FACILITY, early);
  await room("room-b", FACILITY, ba(8, 0));
  await room("room-c", FACILITY, early, ba(7, 13));
  await room("room-tokyo", TOKYO, early);

  x = await company("x");
  y = await company("y");
  idle = (await company("idle")).tenantId;
  person = (await company("person", "individual")).tenantId;
  await book(x, id("room-a"), ba(7, 10), ba(7, 12));
  await book(x, id("room-a"), ba(8, 10), ba(8, 11), true);
  await book(y, id("room-b"), ba(8, 9, 30), ba(8, 10, 30));
  // Tokyo 09:00 to 10:00 on Monday is 00:00Z to 01:00Z, still Sunday evening in Buenos Aires.
  await book(y, id("room-tokyo"), new Date("2030-01-07T00:00:00Z"), new Date("2030-01-07T01:00:00Z"));

  const operator = await owner.appUser.create({ data: { id: id("operator"), name: "op", role: "operator" } });
  const block = (n: string, roomId: string | null, startsAt: Date, endsAt: Date, releasedAt: Date | null) =>
    owner.block.create({
      data: {
        id: id(n),
        facilityId: FACILITY,
        roomId,
        startsAt,
        endsAt,
        reason: "x",
        createdBy: operator.id,
        releasedAt,
      },
    });
  await block("released-halfway", id("room-a"), ba(7, 15), ba(7, 17), ba(7, 16));
  await block("released-before-start", id("room-a"), ba(7, 9), ba(7, 10), ba(7, 9));
  await block("tuesday-afternoon", null, ba(8, 14), ba(8, 17), null);
});

afterAll(() => owner.$disconnect());

const mine = <T extends { facilityId: string }>(rows: readonly T[]) =>
  rows.filter((row) => row.facilityId === FACILITY);

describe("room usage (AC-11)", () => {
  it("counts open minutes inside each room's window, less blocked time, and booked minutes", async () => {
    const rows = mine(await queries.roomUsage(range));
    const by = (name: string) => rows.find((row) => row.roomId === id(name));
    expect(by("room-a")).toMatchObject({ openMinutes: 720, blockedMinutes: 240, bookedMinutes: 120 });
    expect(by("room-b")).toMatchObject({ openMinutes: 300, blockedMinutes: 180, bookedMinutes: 60 });
    expect(by("room-c")).toMatchObject({ openMinutes: 240, blockedMinutes: 0, bookedMinutes: 0 });
  });

  it("reads each facility's days in its own zone", async () => {
    const tokyo = (await queries.roomUsage({ from: "2030-01-07" as LocalDate, to: "2030-01-07" as LocalDate })).find(
      (row) => row.roomId === id("room-tokyo"),
    );
    expect(tokyo).toMatchObject({ openMinutes: 480, bookedMinutes: 60 });
  });

  it("gives a room created mid range no open minutes before it existed", async () => {
    const monday = { from: "2030-01-07" as LocalDate, to: "2030-01-07" as LocalDate };
    const b = mine(await queries.roomUsage(monday)).find((row) => row.roomId === id("room-b"));
    expect(b).toMatchObject({ openMinutes: 0, bookedMinutes: 0 });
  });

  it("has no open minutes on a closed weekend", async () => {
    const weekend = { from: "2030-01-05" as LocalDate, to: "2030-01-06" as LocalDate };
    for (const row of mine(await queries.roomUsage(weekend))) expect(row.openMinutes).toBe(0);
    expect(await queries.heatmap(weekend, { facilityId: FACILITY })).toEqual([]);
  });
});

describe("company usage (AC-12)", () => {
  it("lists every company with confirmed and cancelled counts, idle ones included, cancelled never counted as hours", async () => {
    const rows = await queries.companyUsage(range);
    const by = (tenantId: string) => rows.find((row) => row.id === tenantId);
    expect(by(x.tenantId)).toMatchObject({
      bookedMinutes: 120,
      confirmed: 1,
      cancelled: 1,
      active: true,
      kind: "company",
    });
    expect(by(y.tenantId)).toMatchObject({ bookedMinutes: 120, confirmed: 2, cancelled: 0 });
    expect(by(idle)).toMatchObject({ bookedMinutes: 0, confirmed: 0, cancelled: 0, lastBookingAt: null });
    expect(by(x.tenantId)?.lastBookingAt).toBeInstanceOf(Date);
  });

  it("filters by kind", async () => {
    const individuals = await queries.companyUsage(range, "individual");
    expect(individuals.map((row) => row.id)).toContain(person);
    expect(individuals.every((row) => row.kind === "individual")).toBe(true);
  });

  it("counts a booking by the local day of its facility", async () => {
    const sunday = { from: "2030-01-06" as LocalDate, to: "2030-01-06" as LocalDate };
    const rows = await queries.companyUsage(sunday);
    expect(rows.find((row) => row.id === y.tenantId)?.confirmed).toBe(0);
  });
});

describe("heatmap (AC-13)", () => {
  it("splits bookings across hour cells and leaves blocked hours out", async () => {
    const cells = await queries.heatmap(range, { facilityId: FACILITY });
    const cell = (weekday: number, hour: number) => cells.find((row) => row.weekday === weekday && row.hour === hour);
    // Monday: A 9-15 open and 16-17, C 9-13, B not yet.
    expect(cell(1, 9)).toMatchObject({ openMinutes: 120, bookedMinutes: 0 });
    expect(cell(1, 10)).toMatchObject({ openMinutes: 120, bookedMinutes: 60 });
    expect(cell(1, 11)).toMatchObject({ openMinutes: 120, bookedMinutes: 60 });
    expect(cell(1, 13)).toMatchObject({ openMinutes: 60 });
    expect(cell(1, 15)).toBeUndefined();
    expect(cell(1, 16)).toMatchObject({ openMinutes: 60 });
    // Tuesday: A and B 9-14, booking 9:30 to 10:30 split in two, the facility block 14-17 leaves no cell.
    expect(cell(2, 9)).toMatchObject({ openMinutes: 120, bookedMinutes: 30 });
    expect(cell(2, 10)).toMatchObject({ openMinutes: 120, bookedMinutes: 30 });
    expect(cell(2, 14)).toBeUndefined();
  });

  it("narrows to one room", async () => {
    const cells = await queries.heatmap(range, { roomId: id("room-b") });
    expect(cells.every((row) => row.weekday === 2)).toBe(true);
    expect(cells.reduce((sum, row) => sum + row.bookedMinutes, 0)).toBe(60);
  });

  it("knows whether a scope exists", async () => {
    await expect(queries.scopeExists({ facilityId: FACILITY })).resolves.toBe(true);
    await expect(queries.scopeExists({ roomId: id("room-a"), facilityId: FACILITY })).resolves.toBe(true);
    await expect(queries.scopeExists({ roomId: id("room-a"), facilityId: TOKYO })).resolves.toBe(false);
    await expect(queries.scopeExists({ facilityId: "nope" })).resolves.toBe(false);
    await expect(queries.scopeExists({})).resolves.toBe(true);
  });
});

describe("daily usage (spec 0006)", () => {
  it("answers every local day with the room usage definitions, closed days at zero", async () => {
    const days = await queries.dailyUsage({ from: "2030-01-06" as LocalDate, to: range.to }, { facilityId: FACILITY });
    // Sunday closed. Monday: A 420 (less the released block) and C 240 until it closed. Tuesday: A and B 300 each
    // (less the facility block), the cancelled booking left out.
    expect(days).toEqual([
      { date: "2030-01-06", openMinutes: 0, bookedMinutes: 0 },
      { date: "2030-01-07", openMinutes: 660, bookedMinutes: 120 },
      { date: "2030-01-08", openMinutes: 600, bookedMinutes: 60 },
    ]);
  });

  it("reads the day in each facility's own zone and narrows to one room", async () => {
    const monday = { from: "2030-01-07" as LocalDate, to: "2030-01-07" as LocalDate };
    expect(await queries.dailyUsage(monday, { facilityId: TOKYO })).toEqual([
      { date: "2030-01-07", openMinutes: 480, bookedMinutes: 60 },
    ]);
    expect(await queries.dailyUsage(range, { roomId: id("room-b") })).toEqual([
      { date: "2030-01-07", openMinutes: 0, bookedMinutes: 0 },
      { date: "2030-01-08", openMinutes: 300, bookedMinutes: 60 },
    ]);
  });
});

describe("client activity (spec 0007)", () => {
  // Tuesday 09:00 in Buenos Aires: X's Monday booking is past, Y's Tuesday 09:30 one is still to come.
  const now = ba(8, 9);

  it("groups one client's confirmed bookings by room and by weekday, each on its facility's local day", async () => {
    const activity = await queries.clientActivity(range, y.tenantId, now);
    expect(activity.rooms).toEqual([
      expect.objectContaining({ roomId: id("room-b"), facilityId: FACILITY, bookedMinutes: 60, confirmed: 1 }),
      expect.objectContaining({ roomId: id("room-tokyo"), facilityId: TOKYO, bookedMinutes: 60, confirmed: 1 }),
    ]);
    // Room B on Tuesday; Tokyo on Monday in Tokyo (still Sunday in Buenos Aires).
    expect(activity.weekdays).toEqual([
      { weekday: 1, bookedMinutes: 60, confirmed: 1 },
      { weekday: 2, bookedMinutes: 60, confirmed: 1 },
    ]);
    expect(activity.upcoming).toBe(1);
  });

  it("never counts a cancelled booking, and an idle client has nothing", async () => {
    const activity = await queries.clientActivity(range, x.tenantId, now);
    expect(activity.rooms).toEqual([
      expect.objectContaining({ roomId: id("room-a"), bookedMinutes: 120, confirmed: 1 }),
    ]);
    expect(activity.weekdays).toEqual([{ weekday: 1, bookedMinutes: 120, confirmed: 1 }]);
    expect(activity.upcoming).toBe(0);
    expect(await queries.clientActivity(range, idle, now)).toEqual({ rooms: [], weekdays: [], upcoming: 0 });
  });
});
