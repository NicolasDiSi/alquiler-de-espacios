import type { NextRequest } from "next/server";

import { getInsights } from "@espacios/application";

import { operatorReadEdge } from "@/composition";
import { operatorRoute, readQuery, refuse, respondBody } from "@/lib/operator/route";
import { insightsQuery } from "@/lib/operator/schemas";

/** `GET /api/v1/operator/metrics/insights?from&to&lowOccupancy` (AC-14): low utilization slots and promotion candidates. Only the operator reaches it; a malformed or unreal day is 400 and a reversed or too long range is 422. */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, insightsQuery);
    if (!query) return refuse("invalid_input");
    return respondBody(await getInsights(operatorReadEdge(), actor, query));
  });
}
