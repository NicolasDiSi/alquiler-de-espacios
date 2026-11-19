import type { NextRequest } from "next/server";

import { bookRoom, listMyBookings } from "@espacios/application";
import type { Reason } from "@espacios/domain";
import { getTranslations } from "next-intl/server";

import { companyEdge } from "@/composition";
import { LOCALE } from "@/i18n/config";
import { decodeCursor, encodeCursor } from "@/lib/bookings/cursor";
import { listQuerySchema, parseBookingRequest } from "@/lib/bookings/input";
import { failureResponse } from "@/lib/result/http";
import { authenticateRequest } from "@/lib/session/api";

const NO_STORE = { "Cache-Control": "private, no-store" };

async function refuse(reason: Reason): Promise<Response> {
  const t = await getTranslations({ locale: LOCALE, namespace: "errors" });
  return failureResponse(reason, t(reason));
}

/**
 * `POST /api/v1/bookings` (spec 0001, extended by spec 0003): books a room for the caller's company. Body
 * `{ roomId, startsAt, endsAt }` with RFC 3339 offsets. 201 with `Location` for a new booking, 200 for the exact
 * repeat of one the company already holds; failures are `{ code, message }` with the reason's status.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, "member");
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("invalid_input");
  }
  const input = parseBookingRequest(body);
  if (!input) return refuse("invalid_input");

  const result = await bookRoom(companyEdge(), auth.session.actor, input);
  if (!result.ok) return refuse(result.reason);

  const { booking, created } = result.value;
  const t = await getTranslations({ locale: LOCALE, namespace: "success" });
  const headers = new Headers(NO_STORE);
  if (created) headers.set("Location", `/api/v1/bookings/${booking.id}`);
  return Response.json({ booking, message: t("bookingConfirmed") }, { status: created ? 201 : 200, headers });
}

/**
 * `GET /api/v1/bookings?view=upcoming|past|cancelled&cursor=&limit=` (spec 0003, AC-14): one page of the caller's
 * company bookings, `{ bookings, nextCursor }`. An unknown view, a malformed cursor or one from another view is 400.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, "member");
  if ("response" in auth) return auth.response;

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const query = listQuerySchema.safeParse(params);
  if (!query.success) return refuse("invalid_input");

  const { view, cursor, limit } = query.data;
  const after = cursor === undefined ? null : decodeCursor(cursor, view);
  if (cursor !== undefined && !after) return refuse("invalid_input");

  const result = await listMyBookings(companyEdge(), auth.session.actor, { view, after, limit });
  if (!result.ok) return refuse(result.reason);

  const nextCursor = result.value.next ? encodeCursor(view, result.value.next) : null;
  return Response.json({ bookings: result.value.bookings, nextCursor }, { headers: NO_STORE });
}
