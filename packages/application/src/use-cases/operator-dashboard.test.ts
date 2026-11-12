import type { Actor, LocalDate, UserId } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import type { CompanyUsageRow, MetricRange, OperatorQueries, RoomUsageRow } from "../ports/operator-queries";
import { BusyError } from "../ports/ports";
import { getOperatorDashboard } from "./operator-dashboard";

const operator: Actor = { role: "operator", userId: "user-op" as UserId };
const member: Actor = { role: "member", userId: "user-ana" as UserId, tenantId: "company-acme" as never };
// Thursday 2030-01-10, 12:00 in Buenos Aires: the 7 day period is 2030-01-03 to 2030-01-09.
const clock = { now: () => new Date("2030-01-10T15:00:00Z") };
const input = { period: 7 as const, timeZone: "America/Argentina/Buenos_Aires" };
const CURRENT = "2030-01-03";

const room = (roomId: string, openMinutes: number, bookedMinutes: number): RoomUsageRow => ({
  roomId,
  roomName: roomId,
  facilityId: "f",
  facilityName: "Sede",
  openMinutes,
  blockedMinutes: 0,
  bookedMinutes,
});
const co = (id: string, bookedMinutes: number, confirmed: number, cancelled = 0): CompanyUsageRow => ({
  id,
  name: id,
  kind: "company",
  active: true,
  bookedMinutes,
  confirmed,
  cancelled,
  lastBookingAt: null,
});

function queries(): { queries: OperatorQueries; ranges: MetricRange[] } {
  const ranges: MetricRange[] = [];
  const isCurrent = (range: MetricRange) => range.from === CURRENT;
  return {
    ranges,
    queries: {
      listBookings: async () => [],
      roomUsage: async (range) => {
        ranges.push(range);
        return isCurrent(range)
          ? [room("busy", 100, 90), room("quiet", 100, 10), room("closed", 0, 0), room("mid", 200, 100)]
          : [room("busy", 400, 100)];
      },
      companyUsage: async (range) =>
        isCurrent(range)
          ? [co("a", 120, 4, 1), co("b", 60, 2, 1), co("c", 10, 1), co("d", 5, 1), co("e", 3, 1), co("f", 2, 1)]
          : [co("a", 100, 5)],
      heatmap: async () => [
        { facilityId: "f", facilityName: "Sede", weekday: 1, hour: 9, openMinutes: 60, bookedMinutes: 15 },
        { facilityId: "f", facilityName: "Sede", weekday: 1, hour: 10, openMinutes: 60, bookedMinutes: 45 },
      ],
      clientActivity: async () => ({ rooms: [], weekdays: [], upcoming: 0 }),
      dailyUsage: async (range) => {
        ranges.push(range);
        return [
          { date: "2030-01-02" as LocalDate, openMinutes: 100, bookedMinutes: 10 },
          { date: "2030-01-03" as LocalDate, openMinutes: 100, bookedMinutes: 30 },
          { date: "2030-01-05" as LocalDate, openMinutes: 0, bookedMinutes: 0 },
          { date: "2030-01-06" as LocalDate, openMinutes: 100, bookedMinutes: 50 },
        ];
      },
      scopeExists: async () => true,
    },
  };
}

describe("getOperatorDashboard (spec 0006)", () => {
  it("reads the period, the window before it and 90 days for the chart, and shapes them for the screen", async () => {
    const { queries: q, ranges } = queries();
    const result = await getOperatorDashboard({ queries: q, clock }, operator, input);
    if (!result.ok) throw new Error(result.reason);
    const view = result.value;

    expect(view.range).toEqual({ from: "2030-01-03", to: "2030-01-09" });
    expect(view.previousRange).toEqual({ from: "2029-12-27", to: "2030-01-02" });
    expect(ranges).toContainEqual({ from: "2029-10-12", to: "2030-01-09" });

    // Current: 200 booked of 400 open, 10 confirmed and 2 cancelled. Previous: 100 of 400, 5 confirmed.
    expect(view.totals).toMatchObject({ openMinutes: 400, bookedMinutes: 200, occupancy: 0.5, confirmed: 10 });
    expect(view.totals.cancellationRate).toBeCloseTo(2 / 12);
    expect(view.totals.openDays).toBe(2);
    expect(view.changes.occupancy).toBeCloseTo(0.25);
    expect(view.changes.bookedMinutes).toBe(1);
    expect(view.changes.confirmed).toBe(1);
    expect(view.changes.cancellationRate).toBeCloseTo(2 / 12);

    // Closed days leave the chart; the trend averages the open days so far.
    expect(view.daily.days.map((day) => [day.date, day.occupancy, day.trend])).toEqual([
      ["2030-01-02", 0.1, 0.1],
      ["2030-01-03", 0.3, 0.2],
      ["2030-01-06", 0.5, 0.3],
    ]);

    expect(view.heatmap.peak).toMatchObject({ hour: 10, occupancy: 0.75 });
    expect(view.heatmap.low).toMatchObject({ hour: 9, occupancy: 0.25 });

    expect(view.rooms.map((r) => [r.id, r.demand])).toEqual([
      ["busy", "high"],
      ["mid", "normal"],
      ["quiet", "low"],
    ]);

    // Every company, most booked first, each with its position.
    expect(view.companies.map((c) => [c.id, c.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
      ["e", 5],
      ["f", 6],
    ]);
    expect(view.insights.lowUtilizationSlots.length).toBeLessThanOrEqual(3);
  });

  it("refuses a member and passes a database that cannot answer through", async () => {
    const { queries: q } = queries();
    expect(await getOperatorDashboard({ queries: q, clock }, member, input)).toMatchObject({ reason: "forbidden" });
    const fails = async () => {
      throw new BusyError();
    };
    const failsOnPrevious =
      <T>(read: (range: MetricRange) => Promise<T>) =>
      (range: MetricRange) =>
        range.from === CURRENT ? read(range) : fails();
    const broken: Partial<OperatorQueries>[] = [
      { roomUsage: fails },
      { roomUsage: failsOnPrevious(q.roomUsage) },
      { companyUsage: fails },
      { companyUsage: failsOnPrevious(q.companyUsage) },
      { heatmap: fails },
      { dailyUsage: fails },
    ];
    for (const override of broken) {
      const result = await getOperatorDashboard({ queries: { ...q, ...override }, clock }, operator, input);
      expect(result).toMatchObject({ ok: false, reason: "busy" });
    }
  });

  it("shows nothing measurable as null, never as zero", async () => {
    const empty: OperatorQueries = {
      listBookings: async () => [],
      roomUsage: async () => [room("closed", 0, 0)],
      companyUsage: async () => [],
      heatmap: async () => [],
      clientActivity: async () => ({ rooms: [], weekdays: [], upcoming: 0 }),
      dailyUsage: async () => [],
      scopeExists: async () => true,
    };
    const result = await getOperatorDashboard({ queries: empty, clock }, operator, input);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.totals).toMatchObject({ occupancy: null, cancellationRate: null, openDays: 0 });
    expect(result.value.changes).toEqual({
      occupancy: null,
      bookedMinutes: null,
      confirmed: null,
      cancellationRate: null,
    });
    expect(result.value.heatmap).toEqual({ cells: [], peak: null, low: null });
    expect(result.value.rooms).toEqual([]);
    expect(result.value.companies).toEqual([]);
  });
});
