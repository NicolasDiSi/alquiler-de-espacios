/**
 * Every reason an operation can fail, the closed list of spec 0001 ("Typed result and error contract"). The edges map
 * each one once to an HTTP status and once to a Spanish message from the catalog, so a result carries only the reason.
 * The list lives here because the domain refuses with most of them; `invalid_input`, `unauthenticated` and `busy` come
 * from the edges and the adapters, and share the list so nothing is ever unmapped.
 */
export const REASONS = [
  "invalid_input",
  "not_on_grid",
  "outside_hours",
  "invalid_range",
  "too_short",
  "too_long",
  "past_date",
  "beyond_horizon",
  "cancel_not_allowed",
  "conflict",
  "already_exists",
  "has_future_bookings",
  "block_has_bookings",
  "block_overlaps_block",
  "facility_has_active_rooms",
  "facility_inactive",
  "individual_is_single",
  "already_released",
  "room_inactive",
  "room_blocked",
  "company_inactive",
  "already_cancelled",
  "not_found",
  "unauthenticated",
  "forbidden",
  "busy",
] as const;

export type Reason = (typeof REASONS)[number];

/** A confirmed booking that stands in the way of an operator change (spec 0004, AC-5, AC-6, AC-18). */
export type AffectedBooking = {
  readonly id: string;
  readonly roomId: string;
  readonly roomName: string;
  readonly companyName: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
};

/** What `has_future_bookings` and `block_has_bookings` carry: the first bookings in the way and how many there are. */
export type RefusalDetails = { readonly total: number; readonly bookings: readonly AffectedBooking[] };

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: Reason; readonly details?: RefusalDetails };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * A refusal. The user facing text is not written here: the edge looks it up in the catalog by reason. Only the two
 * "bookings in the way" reasons carry `details`.
 */
export const fail = (reason: Reason, details?: RefusalDetails): Result<never> =>
  details ? { ok: false, reason, details } : { ok: false, reason };
