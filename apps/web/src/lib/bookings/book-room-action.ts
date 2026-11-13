"use server";

import { refresh } from "next/cache";

import { bookRoom as bookRoomUseCase } from "@espacios/application";
import { fail, type Reason } from "@espacios/domain";
import { getTranslations } from "next-intl/server";

import { companyEdge } from "@/composition";
import { fieldsMarkedBy } from "@/lib/bookings/field-marks";
import {
  BOOKING_FORM_FIELDS,
  type BookingFormField,
  type BookingFormValues,
  parseBookingForm,
} from "@/lib/bookings/input";
import { type ActionResult, toActionResult } from "@/lib/result/action-result";
import { getSession } from "@/lib/session/session";

/**
 * What the form gets back (spec 0003, "Form state"). On a refusal: the result with its catalog message, the values as
 * submitted so nothing is lost, and the fields to mark invalid. On a success: the new booking's id and the catalog
 * message; the user stays on the screen, so several bookings can be made in a row (spec 0008).
 */
export type BookingFormState =
  | {
      readonly result: Extract<ActionResult<never>, { ok: false }>;
      readonly values: BookingFormValues;
      readonly invalidFields: readonly BookingFormField[];
    }
  | { readonly result: { readonly ok: true; readonly message: string }; readonly bookingId: string }
  | null;

function valuesOf(formData: FormData): BookingFormValues {
  const read = (field: BookingFormField) => {
    const value = formData.get(field);
    return typeof value === "string" ? value : "";
  };
  return Object.fromEntries(BOOKING_FORM_FIELDS.map((field) => [field, read(field)])) as BookingFormValues;
}

async function refusal(
  reason: Reason,
  values: BookingFormValues,
  invalidFields: readonly BookingFormField[] = fieldsMarkedBy(reason),
): Promise<BookingFormState> {
  const [success, errors] = await Promise.all([getTranslations("success"), getTranslations("errors")]);
  const result = toActionResult(fail(reason), success("bookingConfirmed"), (key) => errors(key));
  return { result: result as Extract<ActionResult<never>, { ok: false }>, values, invalidFields };
}

/**
 * `bookRoom` (spec 0001): the booking form posts `roomId`, `date`, `start` and `end`. The company and the member come
 * from the session cookie, never from the form; the instants are built on the server in the facility's zone. An
 * expired session answers `unauthenticated` (the form links to the picker) instead of redirecting, so the values stay.
 * Next.js checks the Origin of every Server Action.
 */
export async function bookRoom(_previous: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const values = valuesOf(formData);
  const session = await getSession();
  if (!session) return refusal("unauthenticated", values);

  const edge = companyEdge();
  // The room decides the zone the typed day and times are read in (spec 0004).
  const room = await edge.rooms.findRoom(values.roomId.trim());
  const input = parseBookingForm(values, (roomId) => (roomId === room?.id ? room.facility.timeZone : undefined));
  if (!input.ok) return refusal("invalid_input", values, input.invalidFields);

  const result = await bookRoomUseCase(edge, session.actor, input.value);
  // Either way the room's time changed or was not what the screen showed: read the page again, so it shows it.
  refresh();
  if (!result.ok) return refusal(result.reason, values);

  const success = await getTranslations("success");
  return { result: { ok: true, message: success("bookingConfirmed") }, bookingId: result.value.booking.id };
}
