"use server";

import { type BookingView, cancelBooking as cancelBookingUseCase } from "@espacios/application";
import { fail, type Reason } from "@espacios/domain";
import { getTranslations } from "next-intl/server";

import { companyEdge } from "@/composition";
import { type ActionResult, toActionResult } from "@/lib/result/action-result";
import { getSession } from "@/lib/session/session";

/**
 * `cancelBooking` (spec 0001): the cancel button posts only the booking id. The company comes from the session cookie,
 * never from the client, so another company's id is `not_found`. Always answers with the result and its message.
 */
export async function cancelBooking(bookingId: string): Promise<ActionResult<BookingView>> {
  const [success, errors] = await Promise.all([getTranslations("success"), getTranslations("errors")]);
  const message = (reason: Reason) => errors(reason);

  const session = await getSession();
  if (!session)
    return toActionResult(fail("unauthenticated"), success("bookingCancelled"), message) as ActionResult<BookingView>;

  const result = await cancelBookingUseCase(companyEdge(), session.actor, String(bookingId));
  return toActionResult(result, success("bookingCancelled"), message);
}
