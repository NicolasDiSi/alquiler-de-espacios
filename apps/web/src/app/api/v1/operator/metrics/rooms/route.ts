import type { NextRequest } from "next/server";

import { getRoomMetrics } from "@espacios/application";

import { operatorReadEdge } from "@/composition";
import { operatorRoute, readQuery, refuse, respondBody } from "@/lib/operator/route";
import { roomMetricsQuery } from "@/lib/operator/schemas";

/** `GET /api/v1/operator/metrics/rooms?from&to` (spec 0004, AC-11): occupancy per room, facility and overall. Only the operator reaches it; a malformed or unreal day is 400 and a reversed or too long range is 422. */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, roomMetricsQuery);
    if (!query) return refuse("invalid_input");
    return respondBody(await getRoomMetrics(operatorReadEdge(), actor, query));
  });
}
