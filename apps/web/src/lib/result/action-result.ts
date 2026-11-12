import type { Reason, RefusalDetails, Result } from "@espacios/domain";

/**
 * What a Server Action hands the UI (spec 0001): the use case's result plus the text to show, so the user always
 * knows how the operation ended. The REST API answers the same reasons as `{ code, message }` (see `http.ts`).
 */
export type ActionResult<T> =
  | { readonly ok: true; readonly value: T; readonly message: string }
  | {
      readonly ok: false;
      readonly reason: Reason;
      readonly message: string;
      /** Only `has_future_bookings` and `block_has_bookings` carry it: the bookings in the way (spec 0005). */
      readonly details?: RefusalDetails;
    };

/**
 * Adds the message to a use case result. `successMessage` is the action's `success.*` text ("Reserva confirmada");
 * `errorMessage` is the `errors` namespace translator, one key per reason.
 */
export function toActionResult<T>(
  result: Result<T>,
  successMessage: string,
  errorMessage: (reason: Reason) => string,
): ActionResult<T> {
  if (result.ok) return { ok: true, value: result.value, message: successMessage };
  const failure = { ok: false as const, reason: result.reason, message: errorMessage(result.reason) };
  return result.details ? { ...failure, details: result.details } : failure;
}
