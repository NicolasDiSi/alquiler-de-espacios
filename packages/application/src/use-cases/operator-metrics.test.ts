import type { Actor, LocalDate, UserId } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import type { CompanyUsageRow, HeatmapRow, OperatorQueries, RoomUsageRow } from "../ports/operator-queries";
import { BusyError } from "../ports/ports";
import { getCompanyMetrics, getHeatmap, getInsights, getRoomMetrics } from "./operator-metrics";

const operator: Actor = { role: "operator", userId: "user-op" as UserId };
const member: Actor = { role: "member", userId: "user-ana" as UserId, tenantId: "company-acme" as never };
const range = { from: "2030-01-07" as LocalDate, to: "2030-01-08" as LocalDate };

const room = (roomId: string, facilityId: string, openMinutes: number, bookedMinutes: number): RoomUsageRow => ({
  roomId,
  roomName: roomId,
  facilityId,
  facilityName: `Sede ${facilityId}`,
  openMinutes,
  blockedMinutes: 0,
  bookedMinutes,
});
const co = (id: string, bookedMinutes: number, confirmed: number, cancelled = 0, active = true): CompanyUsageRow => ({
  id,
  name: id,
  kind: "company",
  active,
  bookedMinutes,
  confirmed,
  cancelled,
  lastBookingAt: confirmed > 0 ? new Date("2030-01-01T00:00:00Z") : null,
});
const cell = (facilityId: string, hour: number, openMinutes: number, bookedMinutes: number): HeatmapRow => ({
  facilityId,
  facilityName: `Sede ${facilityId}`,
  weekday: 1,
  hour,
  openMinutes,
  bookedMinutes,
});

function deps(data: { rooms?: RoomUsageRow[]; companies?: CompanyUsageRow[]; cells?: HeatmapRow[]; exists?: boolean }) {
  const calls: unknown[] = [];
  const queries: OperatorQueries = {
    listBookings: async () => [],
    roomUsage: async () => data.rooms ?? [],
    companyUsage: async (_range, kind) => {
      calls.push(kind);
      return data.companies ?? [];
    },
    heatmap: async () => data.cells ?? [],
    scopeExists: async () => data.exists ?? true,
  };
  return { deps: { queries }, calls };
}

describe("authorization and range, on every metric", () => {
  it("refuses a member, a reversed range and a range over a year", async () => {
    const { deps: d } = deps({});
    for (const run of [getRoomMetrics, getCompanyMetrics, getHeatmap, getInsights] as const) {
      expect(await run(d, member, range)).toMatchObject({ ok: false, reason: "forbidden" });
      expect(await run(d, operator, { from: range.to, to: range.from })).toMatchObject({ reason: "invalid_range" });
      expect(await run(d, operator, { from: range.from, to: "2032-01-01" as LocalDate })).toMatchObject({
        reason: "invalid_range",
      });
    }
  });
  it("returns busy when the database cannot answer", async () => {
    const queries = {
      roomUsage: async () => {
        throw new BusyError();
      },
    } as unknown as OperatorQueries;
    expect(await getRoomMetrics({ queries }, operator, range)).toMatchObject({ ok: false, reason: "busy" });
  });
});

describe("getRoomMetrics (AC-11)", () => {
  it("weights facility and overall by minutes, and gives null with nothing open", async () => {
    const { deps: d } = deps({ rooms: [room("a", "1", 100, 50), room("b", "1", 300, 50), room("c", "2", 0, 0)] });
    const result = await getRoomMetrics(d, operator, range);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.rooms.map((r) => r.occupancy)).toEqual([0.5, 1 / 6, null]);
    expect(result.value.facilities).toMatchObject([
      { id: "1", occupancy: 0.25 },
      { id: "2", occupancy: null },
    ]);
    expect(result.value.overall).toMatchObject({ openMinutes: 400, bookedMinutes: 100, occupancy: 0.25 });
  });
});

describe("getCompanyMetrics (AC-12)", () => {
  it("sorts by booked time, shares the total, and keeps idle companies with null rates", async () => {
    const { deps: d, calls } = deps({ companies: [co("idle", 0, 0), co("big", 180, 3, 1), co("small", 60, 1)] });
    const result = await getCompanyMetrics(d, operator, { ...range, kind: "individual" });
    if (!result.ok) throw new Error("expected ok");
    expect(calls).toEqual(["individual"]);
    expect(result.value.companies.map((c) => c.id)).toEqual(["big", "small", "idle"]);
    expect(result.value.companies[0]).toMatchObject({ bookedHours: 3, share: 0.75, cancellationRate: 0.25 });
    expect(result.value.companies[2]).toMatchObject({ share: 0, cancellationRate: null, lastBookingAt: null });
  });
  it("has a null share when nobody booked", async () => {
    const { deps: d } = deps({ companies: [co("idle", 0, 0)] });
    const result = await getCompanyMetrics(d, operator, range);
    expect(result.ok && result.value.companies[0]?.share).toBeNull();
  });
});

describe("getHeatmap (AC-13)", () => {
  it("is 404 for an unknown facility or room, and builds cells otherwise", async () => {
    expect(await getHeatmap(deps({ exists: false }).deps, operator, { ...range, facilityId: "nope" })).toMatchObject({
      reason: "not_found",
    });
    const { deps: d } = deps({ cells: [cell("1", 9, 60, 30)] });
    expect(await getHeatmap(d, operator, range)).toEqual({
      ok: true,
      value: { cells: [{ weekday: 1, hour: 9, occupancy: 0.5 }] },
    });
  });
});

describe("getInsights (AC-14)", () => {
  it("lists the emptiest slots per facility and the companies worth a call, most reasons first", async () => {
    const { deps: d } = deps({
      cells: [cell("1", 9, 60, 6), cell("1", 10, 60, 60), cell("2", 9, 60, 0)],
      companies: [
        co("a", 600, 10),
        co("b", 600, 10),
        co("idle", 0, 0),
        co("flaky", 60, 1, 4),
        co("off", 0, 0, 0, false),
      ],
    });
    const result = await getInsights(d, operator, range);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.lowUtilizationSlots.map((s) => [s.facility.id, s.hour])).toEqual([
      ["2", 9],
      ["1", 9],
    ]);
    expect(result.value.promotionCandidates.map((c) => [c.company.id, c.reasons])).toEqual([
      ["idle", ["no_bookings", "low_usage"]],
      ["flaky", ["low_usage", "high_cancellation"]],
    ]);
  });
  it("refuses a threshold outside 0 to 1 and a member before that", async () => {
    const { deps: d } = deps({});
    expect(await getInsights(d, operator, { ...range, lowOccupancy: 1.5 })).toMatchObject({ reason: "invalid_input" });
    expect(await getInsights(d, member, { ...range, lowOccupancy: 1.5 })).toMatchObject({ reason: "forbidden" });
  });
});
