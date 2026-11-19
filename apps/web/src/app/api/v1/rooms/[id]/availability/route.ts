import type { NextRequest } from "next/server";

import { getRoomAvailability } from "@espacios/application";
import { parseLocalDate, type Reason } from "@espacios/domain";
import { getTranslations } from "next-intl/server";

import { companyEdge } from "@/composition";
import { LOCALE } from "@/i18n/config";
import { failureResponse } from "@/lib/result/http";
import { authenticateRequest } from "@/lib/session/api";

async function refuse(reason: Reason): Promise<Response> {
  const t = await getTranslations({ locale: LOCALE, namespace: "errors" });
  return failureResponse(reason, t(reason));
}

/**
 * `GET /api/v1/rooms/{id}/availability?from&to` (spec 0008; `?date` is the one day form of spec 0001): the room, each
 * local day's hours and its busy time, with `kind` and `mine` and never who holds it. Members only. A malformed or
 * unreal day is 400, an unknown room 404, a reversed range or one over 42 days 422.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request, "member");
  if ("response" in auth) return auth.response;

  const query = request.nextUrl.searchParams;
  const date = query.get("date");
  const from = parseLocalDate(query.get("from") ?? date ?? "");
  const to = parseLocalDate(query.get("to") ?? date ?? "");
  if (!from || !to) return refuse("invalid_input");

  const { id } = await params;
  const result = await getRoomAvailability(companyEdge(), auth.session.actor, { roomId: id, from, to });
  if (!result.ok) return refuse(result.reason);
  return Response.json(result.value, { headers: { "Cache-Control": "private, no-store" } });
}
