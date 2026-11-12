import { describe, expect, it } from "vitest";

import type { LocalDate } from "../booking/calendar";
import {
  buildHeatmap,
  cancellationRateOf,
  lowUtilizationSlots,
  METRIC_RANGE_MAX_DAYS,
  occupancyOf,
  promotionReasons,
  shareOf,
  validateMetricRange,
} from "./metrics";

const day = (text: string) => text as LocalDate;

describe("ratios", () => {
  it("is null, never 0, when the denominator is zero", () => {
    expect(occupancyOf(0, 0)).toBeNull();
    expect(cancellationRateOf(0, 0)).toBeNull();
    expect(shareOf(0, 0)).toBeNull();
  });
  it("divides otherwise", () => {
    expect(occupancyOf(30, 120)).toBe(0.25);
    expect(cancellationRateOf(3, 1)).toBe(0.25);
    expect(shareOf(60, 240)).toBe(0.25);
    expect(occupancyOf(0, 60)).toBe(0);
  });
});

describe("validateMetricRange", () => {
  it("accepts one day and a full year, refuses a reversed or too long range", () => {
    expect(validateMetricRange(day("2030-01-07"), day("2030-01-07")).ok).toBe(true);
    expect(validateMetricRange(day("2030-01-01"), day("2030-12-31")).ok).toBe(true);
    expect(validateMetricRange(day("2030-01-08"), day("2030-01-07"))).toMatchObject({
      ok: false,
      reason: "invalid_range",
    });
    expect(METRIC_RANGE_MAX_DAYS).toBe(366);
    expect(validateMetricRange(day("2030-01-01"), day("2031-01-02"))).toMatchObject({ ok: false });
  });
});

describe("buildHeatmap", () => {
  it("is empty without data and null where nothing was open", () => {
    expect(buildHeatmap([])).toEqual([]);
    const cells = buildHeatmap([
      { weekday: 1, hour: 9, openMinutes: 60, bookedMinutes: 30 },
      { weekday: 1, hour: 11, openMinutes: 60, bookedMinutes: 0 },
    ]);
    expect(cells).toEqual([
      { weekday: 1, hour: 9, occupancy: 0.5 },
      { weekday: 1, hour: 10, occupancy: null },
      { weekday: 1, hour: 11, occupancy: 0 },
    ]);
  });
  it("adds minutes of facilities in the same cell (a weighted ratio)", () => {
    const [cell] = buildHeatmap([
      { weekday: 2, hour: 9, openMinutes: 60, bookedMinutes: 60 },
      { weekday: 2, hour: 9, openMinutes: 180, bookedMinutes: 0 },
    ]);
    expect(cell?.occupancy).toBe(0.25);
  });
});

describe("lowUtilizationSlots", () => {
  it("lists cells under the threshold, emptiest first, never a null cell, at most 20", () => {
    const rows = Array.from({ length: 30 }, (_, hour) => ({ weekday: 1, hour, openMinutes: 60, bookedMinutes: hour }));
    const slots = lowUtilizationSlots([{ facility: "F", rows }], 0.5);
    expect(slots).toHaveLength(20);
    expect(slots[0]).toMatchObject({ hour: 0, occupancy: 0 });
    expect(slots.every((slot) => slot.occupancy < 0.5)).toBe(true);
    expect(
      lowUtilizationSlots([{ facility: "F", rows: [{ weekday: 1, hour: 9, openMinutes: 0, bookedMinutes: 0 }] }], 1),
    ).toEqual([]);
  });
});

describe("promotionReasons", () => {
  const company = (bookedMinutes: number, confirmed: number, cancelled = 0, active = true) => ({
    bookedMinutes,
    confirmed,
    cancelled,
    active,
  });

  it("flags no bookings, low usage and high cancellation", () => {
    const all = [company(600, 10), company(600, 10), company(0, 0), company(60, 1, 4)];
    expect(promotionReasons(all[2] as never, all)).toEqual(["no_bookings", "low_usage"]);
    expect(promotionReasons(all[3] as never, all)).toEqual(["low_usage", "high_cancellation"]);
    expect(promotionReasons(all[0] as never, all)).toEqual([]);
  });
  it("needs three active companies for low usage and five bookings for high cancellation", () => {
    const two = [company(600, 10), company(1, 1)];
    expect(promotionReasons(two[1] as never, two)).toEqual([]);
    const few = company(60, 1, 2);
    expect(promotionReasons(few, [few, few, few])).toEqual([]);
  });
  it("never flags an inactive company", () => {
    const gone = company(0, 0, 0, false);
    expect(promotionReasons(gone, [gone])).toEqual([]);
  });
});
