import type { LocalDate } from "../booking/calendar";
import { fail, ok, type Result } from "../shared/result";

/**
 * Metric definitions (spec 0004, "Metrics definitions"). The database counts minutes; the ratios, the thresholds and
 * the insights are rules, so they live here and are tested without a database. A zero denominator is always `null`,
 * never 0: "nobody could book" is not the same as "nobody booked".
 */

/** The longest range a metric reads, in days. A guard so one request cannot ask the database for years of cells. */
export const METRIC_RANGE_MAX_DAYS = 366;

/** The thresholds behind the promotion candidates and the low utilization slots (README Supuestos). */
export const INSIGHT_THRESHOLDS = {
  /** Default `lowOccupancy` of the insights endpoint. */
  lowOccupancy: 0.2,
  /** A company is `low_usage` below this share of the mean booked time of active companies. */
  lowUsageShareOfMean: 0.25,
  /** `low_usage` needs at least this many active companies to have a mean worth comparing to. */
  lowUsageMinCompanies: 3,
  /** A company is `high_cancellation` from this rate... */
  highCancellationRate: 0.3,
  /** ...with at least this many bookings (confirmed and cancelled). */
  highCancellationMinBookings: 5,
  /** At most this many low utilization slots are listed. */
  maxLowSlots: 20,
} as const;

const DAY_MS = 24 * 3_600_000;

/** Inclusive local days `from` to `to`: in order, and no longer than `METRIC_RANGE_MAX_DAYS`. */
export function validateMetricRange(from: LocalDate, to: LocalDate): Result<{ from: LocalDate; to: LocalDate }> {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  return days >= 1 && days <= METRIC_RANGE_MAX_DAYS ? ok({ from, to }) : fail("invalid_range");
}

/** Booked divided by open minutes, or `null` when no room was open (never 0). */
export function occupancyOf(bookedMinutes: number, openMinutes: number): number | null {
  return openMinutes > 0 ? bookedMinutes / openMinutes : null;
}

/** `cancelled / (confirmed + cancelled)`, or `null` with no bookings. */
export function cancellationRateOf(confirmed: number, cancelled: number): number | null {
  const total = confirmed + cancelled;
  return total > 0 ? cancelled / total : null;
}

/** Share of all booked time, or `null` when nobody booked anything in the range. */
export function shareOf(bookedMinutes: number, totalBookedMinutes: number): number | null {
  return totalBookedMinutes > 0 ? bookedMinutes / totalBookedMinutes : null;
}

/** Facility and overall occupancy are a weighted ratio (sum over sum), never an average of room ratios. */
export function sumMinutes<T extends { readonly openMinutes: number; readonly bookedMinutes: number }>(
  rows: readonly T[],
): { openMinutes: number; bookedMinutes: number } {
  return {
    openMinutes: rows.reduce((sum, row) => sum + row.openMinutes, 0),
    bookedMinutes: rows.reduce((sum, row) => sum + row.bookedMinutes, 0),
  };
}

/** One weekday by hour cell of one facility: minutes open and minutes booked inside it. */
export type CellFigures = {
  readonly weekday: number;
  readonly hour: number;
  readonly openMinutes: number;
  readonly bookedMinutes: number;
};

export type HeatmapCell = { readonly weekday: number; readonly hour: number; readonly occupancy: number | null };

/**
 * A dense grid for the weekdays and hours that appear in the data (minutes of different facilities add up in a cell).
 * A cell where no room was open is `null`. Empty data gives an empty grid.
 */
export function buildHeatmap(rows: readonly CellFigures[]): HeatmapCell[] {
  if (rows.length === 0) return [];
  const totals = new Map<string, { open: number; booked: number }>();
  for (const row of rows) {
    const key = `${row.weekday}:${row.hour}`;
    const total = totals.get(key) ?? { open: 0, booked: 0 };
    total.open += row.openMinutes;
    total.booked += row.bookedMinutes;
    totals.set(key, total);
  }
  const weekdays = [...new Set(rows.map((row) => row.weekday))].sort((a, b) => a - b);
  const first = Math.min(...rows.map((row) => row.hour));
  const last = Math.max(...rows.map((row) => row.hour));
  const cells: HeatmapCell[] = [];
  for (const weekday of weekdays) {
    for (let hour = first; hour <= last; hour += 1) {
      const total = totals.get(`${weekday}:${hour}`);
      cells.push({ weekday, hour, occupancy: total ? occupancyOf(total.booked, total.open) : null });
    }
  }
  return cells;
}

export type LowUtilizationSlot<F> = {
  readonly facility: F;
  readonly weekday: number;
  readonly hour: number;
  readonly occupancy: number;
};

/** Cells under `threshold` (null cells never qualify), emptiest first, at most `INSIGHT_THRESHOLDS.maxLowSlots`. */
export function lowUtilizationSlots<F>(
  facilities: readonly { readonly facility: F; readonly rows: readonly CellFigures[] }[],
  threshold: number,
): LowUtilizationSlot<F>[] {
  const slots: LowUtilizationSlot<F>[] = [];
  for (const { facility, rows } of facilities) {
    for (const cell of buildHeatmap(rows)) {
      if (cell.occupancy !== null && cell.occupancy < threshold) {
        slots.push({ facility, weekday: cell.weekday, hour: cell.hour, occupancy: cell.occupancy });
      }
    }
  }
  return slots
    .sort((a, b) => a.occupancy - b.occupancy || a.weekday - b.weekday || a.hour - b.hour)
    .slice(0, INSIGHT_THRESHOLDS.maxLowSlots);
}

export const PROMOTION_REASONS = ["no_bookings", "low_usage", "high_cancellation"] as const;
export type PromotionReason = (typeof PROMOTION_REASONS)[number];

export type CompanyFigures = {
  readonly bookedMinutes: number;
  readonly confirmed: number;
  readonly cancelled: number;
  readonly active: boolean;
};

/**
 * Why a company is worth a call (spec 0004): `no_bookings` (no confirmed booking in the range), `low_usage` (booked time
 * under a quarter of the mean of the active companies, only with at least three of them) and `high_cancellation`
 * (rate of 0.3 or more over at least 5 bookings). Inactive companies never qualify. Empty list: not a candidate.
 */
export function promotionReasons(
  company: CompanyFigures,
  activeCompanies: readonly CompanyFigures[],
): PromotionReason[] {
  if (!company.active) return [];
  const reasons: PromotionReason[] = [];
  if (company.confirmed === 0) reasons.push("no_bookings");
  if (activeCompanies.length >= INSIGHT_THRESHOLDS.lowUsageMinCompanies) {
    const mean = activeCompanies.reduce((sum, c) => sum + c.bookedMinutes, 0) / activeCompanies.length;
    if (company.bookedMinutes < mean * INSIGHT_THRESHOLDS.lowUsageShareOfMean) reasons.push("low_usage");
  }
  const rate = cancellationRateOf(company.confirmed, company.cancelled);
  if (
    rate !== null &&
    rate >= INSIGHT_THRESHOLDS.highCancellationRate &&
    company.confirmed + company.cancelled >= INSIGHT_THRESHOLDS.highCancellationMinBookings
  ) {
    reasons.push("high_cancellation");
  }
  return reasons;
}
