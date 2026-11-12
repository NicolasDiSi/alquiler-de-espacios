import type { Actor, BookingId, UserId } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import type {
  ClientActivityRows,
  CompanyUsageRow,
  MetricRange,
  OperatorBookingRecord,
  OperatorBookingsPageQuery,
  OperatorQueries,
} from "../ports/operator-queries";
import { BusyError } from "../ports/ports";
import { getClientActivity } from "./client-activity";

const operator: Actor = { role: "operator", userId: "user-op" as UserId };
const member: Actor = { role: "member", userId: "user-ana" as UserId, tenantId: "company-acme" as never };
// Thursday 2030-01-10, 12:00 in Buenos Aires: the 7 day period is 2030-01-03 to 2030-01-09.
const now = new Date("2030-01-10T15:00:00Z");
const clock = { now: () => now };
const input = { clientId: "c1", period: 7 as const, timeZone: "America/Argentina/Buenos_Aires" };

const co = (id: string, bookedMinutes: number, confirmed: number, cancelled: number): CompanyUsageRow => ({
  id,
  name: id,
  kind: "company",
  active: true,
  bookedMinutes,
  confirmed,
  cancelled,
  lastBookingAt: null,
});
const record = (id: string, startsAt: string, endsAt: string): OperatorBookingRecord => ({
  id: id as BookingId,
  company: { id: "c1", name: "c1" },
  room: { id: "room-a", name: "Sala A", timeZone: "America/Argentina/Buenos_Aires", facilityName: "Sede A" },
  bookedBy: { name: "Ana" },
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  status: "confirmed",
  createdAt: new Date("2030-01-01T00:00:00Z"),
  cancelledAt: null,
});

const activity: ClientActivityRows = {
  rooms: [
    {
      roomId: "room-a",
      roomName: "Sala A",
      facilityId: "f-b",
      facilityName: "Sede B",
      bookedMinutes: 120,
      confirmed: 2,
    },
    {
      roomId: "room-b",
      roomName: "Sala B",
      facilityId: "f-a",
      facilityName: "Sede A",
      bookedMinutes: 60,
      confirmed: 1,
    },
  ],
  weekdays: [
    { weekday: 3, bookedMinutes: 120, confirmed: 2 },
    { weekday: 6, bookedMinutes: 60, confirmed: 1 },
  ],
  upcoming: 2,
};

function queries(history: () => OperatorBookingRecord[]) {
  const seen: OperatorBookingsPageQuery[] = [];
  const fake: OperatorQueries = {
    listBookings: async (query) => {
      seen.push(query);
      // The next bookings ask for confirmed ones only; anything else is the history of the period.
      return query.filter.status === "confirmed"
        ? [
            record("in-progress", "2030-01-10T14:30:00Z", "2030-01-10T15:30:00Z"),
            record("later", "2030-01-11T13:00:00Z", "2030-01-11T14:00:00Z"),
            record("past", "2030-01-09T13:00:00Z", "2030-01-09T14:00:00Z"),
          ].slice(0, query.limit)
        : history();
    },
    roomUsage: async () => [],
    companyUsage: async (range: MetricRange) =>
      range.from === "2030-01-03" ? [co("c1", 180, 3, 1), co("c2", 180, 2, 0)] : [co("c1", 90, 1, 0)],
    heatmap: async () => [],
    dailyUsage: async () => [],
    clientActivity: async () => activity,
    scopeExists: async () => true,
  };
  return { fake, seen };
}

describe("getClientActivity (spec 0007)", () => {
  it("narrows the period's metrics to the client and shapes its rooms, weekdays and next bookings", async () => {
    const { fake, seen } = queries(() => [record("h1", "2030-01-08T13:00:00Z", "2030-01-08T15:00:00Z")]);
    const result = await getClientActivity({ queries: fake, clock }, operator, input);
    if (!result.ok) throw new Error(result.reason);
    const view = result.value;

    expect(view.range).toEqual({ from: "2030-01-03", to: "2030-01-09" });
    expect(view.totals).toEqual({
      bookedMinutes: 180,
      share: 0.5,
      confirmed: 3,
      cancelled: 1,
      cancellationRate: 0.25,
      upcoming: 2,
      meanMinutes: 60,
    });
    expect(view.changes).toEqual({ bookedMinutes: 1, confirmed: 2, cancellationRate: 0.25 });
    expect(view.preferredRoom).toEqual({
      id: "room-a",
      name: "Sala A",
      facilityName: "Sede B",
      bookedMinutes: 120,
      share: 120 / 180,
    });
    expect(view.facilities).toEqual(["Sede A", "Sede B"]);
    // Monday to Friday always, Saturday because it has bookings, Sunday not.
    expect(view.weekdays.map((day) => [day.weekday, day.bookedMinutes])).toEqual([
      [1, 0],
      [2, 0],
      [3, 120],
      [4, 0],
      [5, 0],
      [6, 60],
    ]);
    expect(view.peakWeekday).toBe(3);
    expect(view.upcoming.map((booking) => booking.id)).toEqual(["in-progress", "later"]);
    expect(view.history).toMatchObject({ capped: false, bookings: [{ id: "h1" }] });

    // The history is bounded by the period's days in Buenos Aires.
    const historyQuery = seen.find((query) => query.filter.status === undefined);
    expect(historyQuery?.filter).toMatchObject({
      companyId: "c1",
      from: new Date("2030-01-03T03:00:00Z"),
      to: new Date("2030-01-10T03:00:00Z"),
    });
  });

  it("stops the history at 500 rows and says so", async () => {
    const page = Array.from({ length: 101 }, (_, index) =>
      record(`h${index}`, "2030-01-08T13:00:00Z", "2030-01-08T14:00:00Z"),
    );
    const { fake } = queries(() => page);
    const result = await getClientActivity({ queries: fake, clock }, operator, input);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.history.bookings).toHaveLength(500);
    expect(result.value.history.capped).toBe(true);
  });

  it("has no preferred room, peak or rate when the client booked nothing", async () => {
    const { fake } = queries(() => []);
    const idle: OperatorQueries = {
      ...fake,
      companyUsage: async () => [co("c1", 0, 0, 0)],
      clientActivity: async () => ({ rooms: [], weekdays: [], upcoming: 0 }),
    };
    const result = await getClientActivity({ queries: idle, clock }, operator, input);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value).toMatchObject({
      preferredRoom: null,
      peakWeekday: null,
      facilities: [],
      totals: { share: null, cancellationRate: null, meanMinutes: null },
      changes: { bookedMinutes: null, confirmed: null, cancellationRate: null },
    });
  });

  it("refuses a member, is 404 for an unknown client and passes a busy database through", async () => {
    const { fake } = queries(() => []);
    expect(await getClientActivity({ queries: fake, clock }, member, input)).toMatchObject({ reason: "forbidden" });
    expect(await getClientActivity({ queries: fake, clock }, operator, { ...input, clientId: "nope" })).toMatchObject({
      reason: "not_found",
    });
    const fails = async () => {
      throw new BusyError();
    };
    for (const override of [
      { companyUsage: fails },
      { clientActivity: fails },
      { listBookings: fails },
    ] satisfies Partial<OperatorQueries>[]) {
      const result = await getClientActivity({ queries: { ...fake, ...override }, clock }, operator, input);
      expect(result).toMatchObject({ ok: false, reason: "busy" });
    }
  });
});
