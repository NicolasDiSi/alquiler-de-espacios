import type { NextRequest } from "next/server";

import { cancelBooking } from "@espacios/application";
import { getTranslations } from "next-intl/server";

import { companyEdge } from "@/composition";
import { LOCALE } from "@/i18n/config";
import { failureResponse } from "@/lib/result/http";
import { authenticateRequest } from "@/lib/session/api";

type Context = { params: Promise<{ id: string }> };

/**
 * `POST /api/v1/bookings/{id}/cancel` (spec 0001): cancels a booking of the caller's company before it starts and
 * answers `{ booking, message }`. Another company's booking is 404, an already cancelled one 409, one that started 422.
 */
export async function POST(request: NextRequest, { params }: Context) {
  const auth = await authenticateRequest(request, "member");
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await cancelBooking(companyEdge(), auth.session.actor, id);
  if (!result.ok) {
    const errors = await getTranslations({ locale: LOCALE, namespace: "errors" });
    return failureResponse(result.reason, errors(result.reason));
  }
  const success = await getTranslations({ locale: LOCALE, namespace: "success" });
  return Response.json(
    { booking: result.value, message: success("bookingCancelled") },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
