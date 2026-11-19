import {
  type Actor,
  authorizeOperator,
  buildHeatmap,
  cancellationRateOf,
  fail,
  type HeatmapCell,
  INSIGHT_THRESHOLDS,
  type LocalDate,
  lowUtilizationSlots,
  occupancyOf,
  ok,
  type PromotionReason,
  promotionReasons,
  type Result,
  shareOf,
  sumMinutes,
  validateMetricRange,
} from "@espacios/domain";

import type { HeatmapScope, OperatorQueries } from "../ports/operator-queries";
import { withRaceHandling } from "./shared";

/**
 * The operator's metrics (spec 0004, AC-11 to AC-14), all over confirmed bookings. The database counts minutes in each
 * facility's own zone; these use cases apply the definitions and shape the answer. Only the operator may ask.
 */

type Deps = { readonly queries: OperatorQueries };
export type MetricInput = { readonly from: LocalDate; readonly to: LocalDate };
type Range = MetricInput;

function authorized<T>(actor: Actor, input: MetricInput, read: (range: Range) => Promise<Result<T>>) {
  const operator = authorizeOperator(actor);
  if (!operator.ok) return Promise.resolve(operator);
  const range = validateMetricRange(input.from, input.to);
  if (!range.ok) return Promise.resolve(range);
  return withRaceHandling(() => read(range.value));
}

export type Usage = { readonly openMinutes: number; readonly bookedMinutes: number; readonly occupancy: number | null };
const usage = (minutes: { openMinutes: number; bookedMinutes: number }): Usage => ({
  ...minutes,
  occupancy: occupancyOf(minutes.bookedMinutes, minutes.openMinutes),
});

export type RoomMetrics = {
  readonly rooms: readonly (Usage & {
    readonly id: string;
    readonly name: string;
    readonly facility: { readonly id: string; readonly name: string };
    readonly blockedMinutes: number;
  })[];
  readonly facilities: readonly (Usage & { readonly id: string; readonly name: string })[];
  readonly overall: Usage;
};

/** AC-11: occupancy per room, per facility and overall. Facility and overall are weighted (sum over sum). */
export function getRoomMetrics(deps: Deps, actor: Actor, input: MetricInput): Promise<Result<RoomMetrics>> {
  return authorized(actor, input, async (range) => {
    const rows = await deps.queries.roomUsage(range);
    const byFacility = new Map<string, { name: string; rows: typeof rows }>();
    for (const row of rows) {
      const entry = byFacility.get(row.facilityId) ?? { name: row.facilityName, rows: [] };
      byFacility.set(row.facilityId, { name: entry.name, rows: [...entry.rows, row] });
    }
    return ok({
      rooms: rows.map((row) => ({
        id: row.roomId,
        name: row.roomName,
        facility: { id: row.facilityId, name: row.facilityName },
        blockedMinutes: row.blockedMinutes,
        ...usage(row),
      })),
      facilities: [...byFacility].map(([id, entry]) => ({ id, name: entry.name, ...usage(sumMinutes(entry.rows)) })),
      overall: usage(sumMinutes(rows)),
    });
  });
}

export type CompanyMetric = {
  readonly id: string;
  readonly name: string;
  readonly kind: "company" | "individual";
  readonly active: boolean;
  readonly bookedMinutes: number;
  readonly bookedHours: number;
  readonly confirmedCount: number;
  readonly cancelledCount: number;
  readonly cancellationRate: number | null;
  readonly share: number | null;
  readonly lastBookingAt: string | null;
};

/** AC-12: every company, idle and inactive ones too, most booked hours first (ties by name). */
export function getCompanyMetrics(
  deps: Deps,
  actor: Actor,
  input: MetricInput & { readonly kind?: "company" | "individual" | undefined },
): Promise<Result<{ companies: readonly CompanyMetric[] }>> {
  return authorized(actor, input, async (range) => {
    const rows = await deps.queries.companyUsage(range, input.kind);
    const total = rows.reduce((sum, row) => sum + row.bookedMinutes, 0);
    const companies = rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        active: row.active,
        bookedMinutes: row.bookedMinutes,
        bookedHours: row.bookedMinutes / 60,
        confirmedCount: row.confirmed,
        cancelledCount: row.cancelled,
        cancellationRate: cancellationRateOf(row.confirmed, row.cancelled),
        share: shareOf(row.bookedMinutes, total),
        lastBookingAt: row.lastBookingAt ? row.lastBookingAt.toISOString() : null,
      }))
      .sort((a, b) => b.bookedMinutes - a.bookedMinutes || a.name.localeCompare(b.name));
    return ok({ companies });
  });
}

/** AC-13: weekday by hour occupancy, a booking split across the hour cells it touches, a closed cell `null`. */
export function getHeatmap(
  deps: Deps,
  actor: Actor,
  input: MetricInput & HeatmapScope,
): Promise<Result<{ cells: readonly HeatmapCell[] }>> {
  return authorized(actor, input, async (range) => {
    const scope = { facilityId: input.facilityId, roomId: input.roomId };
    if (!(await deps.queries.scopeExists(scope))) return fail("not_found");
    return ok({ cells: buildHeatmap(await deps.queries.heatmap(range, scope)) });
  });
}

export type DailyMetric = Usage & { readonly date: LocalDate };

/**
 * Spec 0006: occupancy per local day, with the definitions of `getRoomMetrics` summed over the rooms of the scope. A day
 * with nothing open (a weekend, a closed facility) has `occupancy: null`.
 */
export function getDailyMetrics(
  deps: Deps,
  actor: Actor,
  input: MetricInput & HeatmapScope,
): Promise<Result<{ days: readonly DailyMetric[] }>> {
  return authorized(actor, input, async (range) => {
    const scope = { facilityId: input.facilityId, roomId: input.roomId };
    if (!(await deps.queries.scopeExists(scope))) return fail("not_found");
    const rows = await deps.queries.dailyUsage(range, scope);
    return ok({ days: rows.map((row) => ({ date: row.date, ...usage(row) })) });
  });
}

export type Insights = {
  readonly lowUtilizationSlots: readonly {
    readonly facility: { readonly id: string; readonly name: string };
    readonly weekday: number;
    readonly hour: number;
    readonly occupancy: number;
  }[];
  readonly promotionCandidates: readonly {
    readonly company: { readonly id: string; readonly name: string; readonly kind: "company" | "individual" };
    readonly reasons: readonly PromotionReason[];
    readonly bookedHours: number;
    readonly confirmedCount: number;
    readonly cancelledCount: number;
    readonly cancellationRate: number | null;
    readonly lastBookingAt: string | null;
  }[];
};

/** AC-14: the emptiest cells and the companies worth a call, over the same queries as the metrics above. */
export function getInsights(
  deps: Deps,
  actor: Actor,
  input: MetricInput & { readonly lowOccupancy?: number | undefined },
): Promise<Result<Insights>> {
  const threshold = input.lowOccupancy ?? INSIGHT_THRESHOLDS.lowOccupancy;
  if (!(threshold >= 0 && threshold <= 1)) {
    return Promise.resolve(authorizeOperator(actor).ok ? fail("invalid_input") : fail("forbidden"));
  }
  return authorized(actor, input, async (range) => {
    const [cells, companies] = await Promise.all([deps.queries.heatmap(range, {}), deps.queries.companyUsage(range)]);

    const facilities = new Map<string, { facility: { id: string; name: string }; rows: typeof cells }>();
    for (const cell of cells) {
      const entry = facilities.get(cell.facilityId) ?? {
        facility: { id: cell.facilityId, name: cell.facilityName },
        rows: [],
      };
      facilities.set(cell.facilityId, { facility: entry.facility, rows: [...entry.rows, cell] });
    }

    const active = companies.filter((company) => company.active);
    const candidates = companies
      .map((company) => ({ company, reasons: promotionReasons({ ...company, confirmed: company.confirmed }, active) }))
      .filter((entry) => entry.reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length || a.company.bookedMinutes - b.company.bookedMinutes);

    return ok({
      lowUtilizationSlots: lowUtilizationSlots([...facilities.values()], threshold),
      promotionCandidates: candidates.map(({ company, reasons }) => ({
        company: { id: company.id, name: company.name, kind: company.kind },
        reasons,
        bookedHours: company.bookedMinutes / 60,
        confirmedCount: company.confirmed,
        cancelledCount: company.cancelled,
        cancellationRate: cancellationRateOf(company.confirmed, company.cancelled),
        lastBookingAt: company.lastBookingAt ? company.lastBookingAt.toISOString() : null,
      })),
    });
  });
}
