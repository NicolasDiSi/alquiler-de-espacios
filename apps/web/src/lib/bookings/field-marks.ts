import type { Reason } from "@espacios/domain";

import type { BookingFormField } from "./input";

/**
 * Spec 0003, "Field marks per reason" (AC-3): which form fields a refusal marks invalid. `invalid_input` marks the
 * fields of the Zod error paths instead; `busy`, `unauthenticated` and `forbidden` mark none (the alert only).
 */
const MARKS: Partial<Record<Reason, readonly BookingFormField[]>> = {
  not_found: ["roomId"],
  past_date: ["date"],
  beyond_horizon: ["date"],
  outside_hours: ["start", "end"],
  not_on_grid: ["start", "end"],
  invalid_range: ["end"],
  too_short: ["end"],
  too_long: ["end"],
  conflict: ["start", "end"],
  room_inactive: ["roomId"],
  room_blocked: ["start", "end"],
};

export function fieldsMarkedBy(reason: Reason): readonly BookingFormField[] {
  return MARKS[reason] ?? [];
}
