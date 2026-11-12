import type { BookingId, BookingStatus } from "@espacios/domain";
import {
  type Actor,
  authorizeOperator,
  type BookingPhase,
  bookingPhase,
  ok,
  type Result,
  toFacilityIso,
} from "@espacios/domain";

import type {
  OperatorBookingFilter,
  OperatorBookingPosition,
  OperatorBookingRecord,
  OperatorQueries,
} from "../ports/operator-queries";
import type { Clock } from "../ports/ports";
import { withRaceHandling } from "./shared";

/** The operator's booking row (spec 0004, AC-10): the member's view plus the company, with the room's facility offset. */
export type OperatorBookingView = {
  readonly id: BookingId;
  readonly company: { readonly id: string; readonly name: string };
  readonly room: { readonly id: string; readonly name: string };
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: BookingStatus;
  readonly phase: BookingPhase;
  readonly bookedBy: { readonly name: string };
  readonly createdAt: string;
  readonly cancelledAt: string | null;
};

function toView(record: OperatorBookingRecord, now: Date): OperatorBookingView {
  const zone = record.room.timeZone;
  return {
    id: record.id,
    company: record.company,
    room: { id: record.room.id, name: record.room.name },
    startsAt: toFacilityIso(record.startsAt, zone),
    endsAt: toFacilityIso(record.endsAt, zone),
    status: record.status,
    phase: bookingPhase(record, now),
    bookedBy: record.bookedBy,
    createdAt: toFacilityIso(record.createdAt, zone),
    cancelledAt: record.cancelledAt ? toFacilityIso(record.cancelledAt, zone) : null,
  };
}

/** Spec 0004, AC-10: 50 per page by default, never more than 100. */
export const OPERATOR_BOOKINGS_PAGE = { defaultLimit: 50, maxLimit: 100 } as const;

export type ListOperatorBookingsInput = {
  readonly filter: OperatorBookingFilter;
  readonly after: OperatorBookingPosition | null;
  readonly limit: number;
};

export type OperatorBookingsPage = {
  readonly bookings: readonly OperatorBookingView[];
  /** Where the next page starts; `null` when this page is the last one. */
  readonly next: OperatorBookingPosition | null;
};

/**
 * `listOperatorBookings` (spec 0004, AC-10): one page of every company's bookings, upcoming first. One row more than
 * asked is read to know whether another page exists. Only the operator may ask (authorization is a business rule).
 */
export async function listOperatorBookings(
  deps: { readonly queries: OperatorQueries; readonly clock: Clock },
  actor: Actor,
  input: ListOperatorBookingsInput,
): Promise<Result<OperatorBookingsPage>> {
  const operator = authorizeOperator(actor);
  if (!operator.ok) return operator;

  const now = input.after?.now ?? deps.clock.now();
  const limit = Math.min(Math.max(1, Math.trunc(input.limit)), OPERATOR_BOOKINGS_PAGE.maxLimit);
  return withRaceHandling(async () => {
    const rows = await deps.queries.listBookings({ filter: input.filter, after: input.after, limit: limit + 1, now });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const next =
      rows.length > limit && last
        ? {
            now,
            run: last.endsAt > now ? ("upcoming" as const) : ("past" as const),
            startsAt: last.startsAt,
            id: last.id,
          }
        : null;
    return ok({ bookings: page.map((record) => toView(record, now)), next });
  });
}
