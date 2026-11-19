import {
  type Actor,
  authorizeOperator,
  cancellationRateOf,
  countChange,
  type DashboardPeriod,
  type DayRange,
  dashboardRanges,
  type HeatmapCell,
  INSIGHT_THRESHOLDS,
  type LocalDate,
  ok,
  type Result,
  type RoomDemand,
  rateChange,
  roomDemand,
  todayAt,
  trailingMeans,
} from "@espacios/domain";

import type { OperatorQueries } from "../ports/operator-queries";
import type { Clock } from "../ports/ports";
import {
  type CompanyMetric,
  getCompanyMetrics,
  getDailyMetrics,
  getHeatmap,
  getInsights,
  getRoomMetrics,
  type Insights,
} from "./operator-metrics";

/**
 * The operator dashboard (spec 0006, assumed): the metric use cases of spec 0004 for one period, shaped for the screen.
 * Plain numbers, no text: the screen formats them. Seven reads in parallel whatever the number of rooms or companies.
 */

type Deps = { readonly queries: OperatorQueries; readonly clock: Clock };

/** How many of each insight the recommendations list. */
export const DASHBOARD_LIMITS = { candidates: 3, slots: 3 } as const;

export type DashboardTotals = {
  readonly openMinutes: number;
  readonly bookedMinutes: number;
  readonly occupancy: number | null;
  readonly confirmed: number;
  readonly cancelled: number;
  readonly cancellationRate: number | null;
};

export type DashboardDay = {
  readonly date: LocalDate;
  readonly bookedMinutes: number;
  readonly occupancy: number;
  /** Mean of this open day and the ones before it (`DASHBOARD_RULES.trendWindow`). */
  readonly trend: number;
};

export type DashboardRoom = {
  readonly id: string;
  readonly name: string;
  readonly facilityName: string;
  readonly openMinutes: number;
  readonly bookedMinutes: number;
  readonly occupancy: number;
  readonly demand: RoomDemand;
};

export type OperatorDashboard = {
  readonly period: DashboardPeriod;
  readonly range: DayRange;
  readonly previousRange: DayRange;
  readonly totals: DashboardTotals & {
    /** Days of the period on which some room was open. */
    readonly openDays: number;
  };
  /** Against the previous window: rates as a difference, counts as a ratio. `null` when there is no base. */
  readonly changes: {
    readonly occupancy: number | null;
    readonly bookedMinutes: number | null;
    readonly confirmed: number | null;
    readonly cancellationRate: number | null;
  };
  /** Open days of the 90 day series, oldest first. */
  readonly daily: { readonly range: DayRange; readonly days: readonly DashboardDay[] };
  readonly heatmap: {
    readonly cells: readonly HeatmapCell[];
    /** The busiest and the emptiest open cell, `null` when no cell was open. */
    readonly peak: HeatmapCell | null;
    readonly low: HeatmapCell | null;
  };
  /** Rooms open in the period, busiest first. */
  readonly rooms: readonly DashboardRoom[];
  /**
   * Every company, idle and inactive ones included, with its position by booked hours (1 is the most booked). The
   * screen searches, filters, sorts and pages them: one query, a small collection.
   */
  readonly companies: readonly (CompanyMetric & { readonly rank: number })[];
  readonly insights: Insights;
};

function totalsOf(
  overall: { openMinutes: number; bookedMinutes: number; occupancy: number | null },
  companies: readonly CompanyMetric[],
): DashboardTotals {
  const confirmed = companies.reduce((sum, company) => sum + company.confirmedCount, 0);
  const cancelled = companies.reduce((sum, company) => sum + company.cancelledCount, 0);
  return { ...overall, confirmed, cancelled, cancellationRate: cancellationRateOf(confirmed, cancelled) };
}

const extreme = (cells: readonly HeatmapCell[], pick: (a: number, b: number) => boolean) =>
  cells.reduce<HeatmapCell | null>(
    (best, cell) =>
      cell.occupancy !== null && (best?.occupancy == null || pick(cell.occupancy, best.occupancy)) ? cell : best,
    null,
  );

export async function getOperatorDashboard(
  deps: Deps,
  actor: Actor,
  input: { readonly period: DashboardPeriod; readonly timeZone: string },
): Promise<Result<OperatorDashboard>> {
  const operator = authorizeOperator(actor);
  if (!operator.ok) return operator;
  const ranges = dashboardRanges(todayAt(deps.clock.now(), input.timeZone), input.period);

  const [rooms, previousRooms, companies, previousCompanies, heatmap, insights, daily] = await Promise.all([
    getRoomMetrics(deps, actor, ranges.current),
    getRoomMetrics(deps, actor, ranges.previous),
    getCompanyMetrics(deps, actor, ranges.current),
    getCompanyMetrics(deps, actor, ranges.previous),
    getHeatmap(deps, actor, ranges.current),
    getInsights(deps, actor, { ...ranges.current, lowOccupancy: INSIGHT_THRESHOLDS.lowOccupancy }),
    getDailyMetrics(deps, actor, ranges.series),
  ]);
  if (!rooms.ok) return rooms;
  if (!previousRooms.ok) return previousRooms;
  if (!companies.ok) return companies;
  if (!previousCompanies.ok) return previousCompanies;
  if (!heatmap.ok) return heatmap;
  if (!insights.ok) return insights;
  if (!daily.ok) return daily;

  const totals = totalsOf(rooms.value.overall, companies.value.companies);
  const previous = totalsOf(previousRooms.value.overall, previousCompanies.value.companies);

  const openDays = daily.value.days.filter((day) => day.occupancy !== null);
  const trend = trailingMeans(openDays.map((day) => day.occupancy ?? 0));

  return ok({
    period: input.period,
    range: ranges.current,
    previousRange: ranges.previous,
    totals: {
      ...totals,
      openDays: openDays.filter((day) => day.date >= ranges.current.from).length,
    },
    changes: {
      occupancy: rateChange(totals.occupancy, previous.occupancy),
      bookedMinutes: countChange(totals.bookedMinutes, previous.bookedMinutes),
      confirmed: countChange(totals.confirmed, previous.confirmed),
      cancellationRate: rateChange(totals.cancellationRate, previous.cancellationRate),
    },
    daily: {
      range: ranges.series,
      days: openDays.map((day, index) => ({
        date: day.date,
        bookedMinutes: day.bookedMinutes,
        occupancy: day.occupancy ?? 0,
        trend: trend[index] ?? 0,
      })),
    },
    heatmap: {
      cells: heatmap.value.cells,
      peak: extreme(heatmap.value.cells, (a, b) => a > b),
      low: extreme(heatmap.value.cells, (a, b) => a < b),
    },
    rooms: rooms.value.rooms
      .flatMap((room) => {
        const demand = roomDemand(room.occupancy);
        return room.occupancy === null || demand === null
          ? []
          : [
              {
                id: room.id,
                name: room.name,
                facilityName: room.facility.name,
                openMinutes: room.openMinutes,
                bookedMinutes: room.bookedMinutes,
                occupancy: room.occupancy,
                demand,
              },
            ];
      })
      .sort((a, b) => b.occupancy - a.occupancy || a.name.localeCompare(b.name)),
    companies: companies.value.companies.map((company, index) => ({ ...company, rank: index + 1 })),
    insights: {
      promotionCandidates: insights.value.promotionCandidates.slice(0, DASHBOARD_LIMITS.candidates),
      lowUtilizationSlots: insights.value.lowUtilizationSlots.slice(0, DASHBOARD_LIMITS.slots),
    },
  });
}
