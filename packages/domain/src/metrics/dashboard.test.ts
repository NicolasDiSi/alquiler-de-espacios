import { describe, expect, it } from "vitest";

import type { LocalDate } from "../booking/calendar";
import { countChange, dashboardRanges, rateChange, roomDemand, trailingMeans } from "./dashboard";

describe("dashboardRanges", () => {
  it("reads complete days ending yesterday, the same length before it, and 90 days for the chart", () => {
    expect(dashboardRanges("2026-11-12" as LocalDate, 7)).toEqual({
      current: { from: "2026-11-05", to: "2026-11-11" },
      previous: { from: "2026-10-29", to: "2026-11-04" },
      series: { from: "2026-08-14", to: "2026-11-11" },
    });
    expect(dashboardRanges("2026-03-01" as LocalDate, 30).current).toEqual({ from: "2026-01-30", to: "2026-02-28" });
  });
});

describe("changes", () => {
  it("compares rates as a difference and counts as a ratio, unknown when there is no base", () => {
    expect(rateChange(0.5, 0.25)).toBe(0.25);
    expect(rateChange(null, 0.25)).toBeNull();
    expect(rateChange(0.5, null)).toBeNull();
    expect(countChange(12, 10)).toBeCloseTo(0.2);
    expect(countChange(3, 0)).toBeNull();
  });
});

describe("roomDemand", () => {
  it("marks high from 80%, low under 20%, and nothing when the room was closed", () => {
    expect(roomDemand(0.8)).toBe("high");
    expect(roomDemand(0.5)).toBe("normal");
    expect(roomDemand(0.2)).toBe("normal");
    expect(roomDemand(0.19)).toBe("low");
    expect(roomDemand(null)).toBeNull();
  });
});

describe("trailingMeans", () => {
  it("averages each value with up to four before it", () => {
    expect(trailingMeans([10, 20, 30, 40, 50, 60])).toEqual([10, 15, 20, 25, 30, 40]);
    expect(trailingMeans([], 3)).toEqual([]);
  });
});
