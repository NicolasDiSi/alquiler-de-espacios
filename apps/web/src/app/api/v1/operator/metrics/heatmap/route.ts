import type { NextRequest } from "next/server";

import { getHeatmap } from "@espacios/application";

import { operatorReadEdge } from "@/composition";
import { operatorRoute, readQuery, refuse, respondBody } from "@/lib/operator/route";
import { heatmapQuery } from "@/lib/operator/schemas";

/** `GET /api/v1/operator/metrics/heatmap?from&to&facilityId&roomId` (AC-13): weekday by hour occupancy. Only the operator reaches it; a malformed or unreal day is 400 and a reversed or too long range is 422. */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, heatmapQuery);
    if (!query) return refuse("invalid_input");
    return respondBody(await getHeatmap(operatorReadEdge(), actor, query));
  });
}
