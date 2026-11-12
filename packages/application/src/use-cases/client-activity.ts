import {
  type Actor,
  addDays,
  authorizeOperator,
  countChange,
  type DashboardPeriod,
  type DayRange,
  dashboardRanges,
  fail,
  ok,
  type Result,
  rateChange,
  shareOf,
  todayAt,
  zonedInstant,
} from "@espacios/domain";

import type { OperatorQueries } from "../ports/operator-queries";
import type { Clock } from "../ports/ports";
import { listOperatorBookings, OPERATOR_BOOKINGS_PAGE, type OperatorBookingView } from "./operator-bookings";
import { getCompanyMetrics } from "./operator-metrics";
import { withRaceHandling } from "./shared";

/**
 * One client's activity for the operator (spec 0007, assumed): the spec 0004 metrics narrowed to this client for one
 * period, its rooms and weekdays, its next bookings and its history. Plain values, no text: the screen formats them.
 */

type Deps = { readonly queries: OperatorQueries; readonly clock: Clock };

/** Next bookings shown as cards, and the most history rows read for one period. */
export const CLIENT_ACTIVITY_LIMITS = { upcoming: 3, history: 500 } as const;

/** Weekdays always shown in the weekly pattern (Monday to Friday); a weekend day shows only when it has bookings. */
const WORKWEEK = [1, 2, 3, 4, 5] as const;

export type ClientActivity = {
  readonly period: DashboardPeriod;
  readonly range: DayRange;
  readonly totals: {
    readonly bookedMinutes: number;
    /** Of every company's booked time in the period. */
    readonly share: number | null;
    readonly confirmed: number;
    readonly cancelled: number;
    readonly cancellationRate: number | null;
    /** Confirmed bookings starting after now, whatever the period. */
    readonly upcoming: number;
    /** Booked minutes over confirmed bookings. */
    readonly meanMinutes: number | null;
  };
  /** Against the previous window: counts as a ratio, the rate as a difference. `null` when there is no base. */
  readonly changes: {
    readonly bookedMinutes: number | null;
    readonly confirmed: number | null;
    readonly cancellationRate: number | null;
  };
  /** The room with the most booked time (ties by name), and its share of the client's time. */
  readonly preferredRoom: {
    readonly id: string;
    readonly name: string;
    readonly facilityName: string;
    readonly bookedMinutes: number;
    readonly share: number | null;
  } | null;
  /** Sedes where the client booked in the period, by name. */
  readonly facilities: readonly string[];
  /** Monday first; weekend days only with bookings. */
  readonly weekdays: readonly {
    readonly weekday: number;
    readonly bookedMinutes: number;
    readonly confirmed: number;
  }[];
  /** The weekday with the most booked time, `null` with none. */
  readonly peakWeekday: number | null;
  /** The next confirmed bookings, soonest first (one in progress counts). */
  readonly upcoming: readonly OperatorBookingView[];
  /** Every booking of the period, confirmed and cancelled, up to `CLIENT_ACTIVITY_LIMITS.history`. */
  readonly history: { readonly bookings: readonly OperatorBookingView[]; readonly capped: boolean };
};

/** Every page of a filter, until it ends or reaches `max` rows. */
async function readAll(
  deps: Deps,
  actor: Actor,
  filter: Parameters<typeof listOperatorBookings>[2]["filter"],
  max: number,
): Promise<Result<{ bookings: OperatorBookingView[]; capped: boolean }>> {
  const bookings: OperatorBookingView[] = [];
  let after: Parameters<typeof listOperatorBookings>[2]["after"] = null;
  do {
    const page = await listOperatorBookings(deps, actor, { filter, after, limit: OPERATOR_BOOKINGS_PAGE.maxLimit });
    if (!page.ok) return page;
    bookings.push(...page.value.bookings);
    after = page.value.next;
  } while (after && bookings.length < max);
  return ok({ bookings: bookings.slice(0, max), capped: after !== null || bookings.length > max });
}

export async function getClientActivity(
  deps: Deps,
  actor: Actor,
  input: { readonly clientId: string; readonly period: DashboardPeriod; readonly timeZone: string },
): Promise<Result<ClientActivity>> {
  const operator = authorizeOperator(actor);
  if (!operator.ok) return operator;
  const now = deps.clock.now();
  const ranges = dashboardRanges(todayAt(now, input.timeZone), input.period);
  const companyId = input.clientId;

  const [current, previous, activity, next, history] = await Promise.all([
    getCompanyMetrics(deps, actor, ranges.current),
    getCompanyMetrics(deps, actor, ranges.previous),
    withRaceHandling(async () => ok(await deps.queries.clientActivity(ranges.current, companyId, now))),
    listOperatorBookings(deps, actor, {
      filter: { companyId, status: "confirmed" },
      after: null,
      limit: CLIENT_ACTIVITY_LIMITS.upcoming,
    }),
    // The history bounds the start with the period's days in the app's zone.
    readAll(
      deps,
      actor,
      {
        companyId,
        from: zonedInstant(ranges.current.from, 0, input.timeZone),
        to: zonedInstant(addDays(ranges.current.to, 1), 0, input.timeZone),
      },
      CLIENT_ACTIVITY_LIMITS.history,
    ),
  ]);
  if (!current.ok) return current;
  if (!previous.ok) return previous;
  if (!activity.ok) return activity;
  if (!next.ok) return next;
  if (!history.ok) return history;

  const mine = current.value.companies.find((company) => company.id === companyId);
  if (!mine) return fail("not_found");
  const before = previous.value.companies.find((company) => company.id === companyId);

  const { rooms, weekdays, upcoming } = activity.value;
  const top = rooms[0];
  const byWeekday = new Map(weekdays.map((row) => [row.weekday, row]));
  const shown = [1, 2, 3, 4, 5, 6, 0].filter(
    (day) => (WORKWEEK as readonly number[]).includes(day) || byWeekday.has(day),
  );
  const peak = weekdays.reduce<(typeof weekdays)[number] | null>(
    (best, row) => (best === null || row.bookedMinutes > best.bookedMinutes ? row : best),
    null,
  );

  return ok({
    period: input.period,
    range: ranges.current,
    totals: {
      bookedMinutes: mine.bookedMinutes,
      share: mine.share,
      confirmed: mine.confirmedCount,
      cancelled: mine.cancelledCount,
      cancellationRate: mine.cancellationRate,
      upcoming,
      meanMinutes: mine.confirmedCount > 0 ? mine.bookedMinutes / mine.confirmedCount : null,
    },
    changes: {
      bookedMinutes: countChange(mine.bookedMinutes, before?.bookedMinutes ?? 0),
      confirmed: countChange(mine.confirmedCount, before?.confirmedCount ?? 0),
      cancellationRate: rateChange(mine.cancellationRate, before?.cancellationRate ?? null),
    },
    preferredRoom: top
      ? {
          id: top.roomId,
          name: top.roomName,
          facilityName: top.facilityName,
          bookedMinutes: top.bookedMinutes,
          share: shareOf(top.bookedMinutes, mine.bookedMinutes),
        }
      : null,
    facilities: [...new Set(rooms.map((room) => room.facilityName))].sort((a, b) => a.localeCompare(b)),
    weekdays: shown.map((weekday) => byWeekday.get(weekday) ?? { weekday, bookedMinutes: 0, confirmed: 0 }),
    peakWeekday: peak?.weekday ?? null,
    upcoming: next.value.bookings.filter((booking) => booking.phase === "upcoming" || booking.phase === "in_progress"),
    history: history.value,
  });
}
