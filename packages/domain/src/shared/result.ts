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

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: Reason };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/** A refusal. The user facing text is not written here: the edge looks it up in the catalog by reason. */
export const fail = (reason: Reason): Result<never> => ({ ok: false, reason });
