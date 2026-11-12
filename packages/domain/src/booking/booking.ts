import type { Brand } from "../shared/brand";
import { fail, ok, type Result } from "../shared/result";

export type BookingId = Brand<string, "BookingId">;

/** What is stored. Cancelling keeps the row (metrics and the Canceladas view need the history). */
export const BOOKING_STATUSES = ["confirmed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * What the user sees (spec 0003, "State transitions"): derived at read time, never stored. Labels: Confirmada,
 * En curso, Finalizada, Cancelada.
 */
export const BOOKING_PHASES = ["upcoming", "in_progress", "finished", "cancelled"] as const;
export type BookingPhase = (typeof BOOKING_PHASES)[number];

export function bookingPhase(
  booking: { readonly status: BookingStatus; readonly startsAt: Date; readonly endsAt: Date },
  now: Date,
): BookingPhase {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.endsAt.getTime() <= now.getTime()) return "finished";
  if (booking.startsAt.getTime() <= now.getTime()) return "in_progress";
  return "upcoming";
}

/**
 * Spec 0001, "Booking rules": a booking is cancelled any time before it starts. Once it started (in progress or
 * finished) it stays as it was, and a booking already cancelled is not cancelled twice. The company is not checked
 * here: another company's booking is invisible, so it never gets this far (`not_found`).
 */
export function checkCancellation(
  booking: { readonly status: BookingStatus; readonly startsAt: Date },
  now: Date,
): Result<null> {
  if (booking.status === "cancelled") return fail("already_cancelled");
  if (booking.startsAt.getTime() <= now.getTime()) return fail("cancel_not_allowed");
  return ok(null);
}
