import { addDays, type LocalDate } from "../booking/calendar";
import { INSIGHT_THRESHOLDS } from "./metrics";

/**
 * The operator dashboard's reading of the metrics (spec 0006, assumed). The definitions stay those of spec 0004; these
 * rules only say which window is read, what a change means and when a room stands out.
 */

/** The windows the dashboard reads, in days. */
export const DASHBOARD_PERIODS = [7, 30, 90] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const DASHBOARD_RULES = {
  /** The daily chart always covers this many days, whatever the period. */
  seriesDays: 90,
  /** Open days in the trailing mean of the daily chart: one working week. */
  trendWindow: 5,
  /** A room in high demand from this occupancy on (the template's threshold). */
  highDemandFrom: 0.8,
  /** A room in low demand under the insights threshold, so the screen and the insights agree. */
  lowDemandBelow: INSIGHT_THRESHOLDS.lowOccupancy,
} as const;

export type DayRange = { readonly from: LocalDate; readonly to: LocalDate };

/**
 * The last `days` complete local days, ending yesterday (today is still being booked), the same length right before it
 * for the comparison, and the daily chart's window.
 */
export function dashboardRanges(today: LocalDate, days: DashboardPeriod) {
  const to = addDays(today, -1);
  const from = addDays(to, -(days - 1));
  const previousTo = addDays(from, -1);
  return {
    current: { from, to },
    previous: { from: addDays(previousTo, -(days - 1)), to: previousTo },
    series: { from: addDays(to, -(DASHBOARD_RULES.seriesDays - 1)), to },
  } satisfies Record<string, DayRange>;
}

/** Change between two rates, as a difference (0.05 is five points). `null` when either side is unknown. */
export function rateChange(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}

/** Relative change between two counts (0.12 is +12%). `null` when there is nothing to compare against. */
export function countChange(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

export const ROOM_DEMANDS = ["high", "normal", "low"] as const;
export type RoomDemand = (typeof ROOM_DEMANDS)[number];

/** How busy a room was. A room with nothing open has no demand to judge (`null`). */
export function roomDemand(occupancy: number | null): RoomDemand | null {
  if (occupancy === null) return null;
  if (occupancy >= DASHBOARD_RULES.highDemandFrom) return "high";
  if (occupancy < DASHBOARD_RULES.lowDemandBelow) return "low";
  return "normal";
}

/** The mean of each value and the ones before it, up to `window` values. The first ones average over what they have. */
export function trailingMeans(values: readonly number[], window: number = DASHBOARD_RULES.trendWindow): number[] {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}
