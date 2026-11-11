import type { Reason } from "@espacios/domain";

/** Spec 0001, "Typed result and error contract": each reason has exactly one HTTP status. */
const STATUS = {
  invalid_input: 400,
  not_on_grid: 422,
  outside_hours: 422,
  invalid_range: 422,
  too_short: 422,
  too_long: 422,
  past_date: 422,
  beyond_horizon: 422,
  cancel_not_allowed: 422,
  conflict: 409,
  room_inactive: 409,
  room_blocked: 409,
  company_inactive: 403,
  already_cancelled: 409,
  not_found: 404,
  unauthenticated: 401,
  forbidden: 403,
  busy: 503,
} as const satisfies Record<Reason, number>;

/** Seconds a client should wait before retrying a `busy` answer. */
const RETRY_AFTER_SECONDS = 1;

export function reasonToHttp(reason: Reason): (typeof STATUS)[Reason] {
  return STATUS[reason];
}

/**
 * The API's failure body, `{ code, message }`, with the reason's status. `busy` adds `Retry-After`. The message is
 * the catalog text for the reason, never a driver error or another company's booking.
 */
export function failureResponse(reason: Reason, message: string): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (reason === "busy") headers.set("Retry-After", String(RETRY_AFTER_SECONDS));
  return Response.json({ code: reason, message }, { status: reasonToHttp(reason), headers });
}
