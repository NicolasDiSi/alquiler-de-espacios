import type { Brand } from "../shared/brand";

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
