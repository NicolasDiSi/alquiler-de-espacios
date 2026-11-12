import type { NextRequest } from "next/server";

import { getDailyMetrics } from "@espacios/application";

import { operatorReadEdge } from "@/composition";
import { operatorRoute, readQuery, refuse, respondBody } from "@/lib/operator/route";
import { heatmapQuery } from "@/lib/operator/schemas";

/** `GET /api/v1/operator/metrics/daily?from&to&facilityId&roomId` (spec 0006): occupancy per local day, with the room usage definitions. Same query as the heatmap: a malformed or unreal day is 400, a reversed or too long range is 422 and an unknown facility or room is 404. */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, heatmapQuery);
    if (!query) return refuse("invalid_input");
    return respondBody(await getDailyMetrics(operatorReadEdge(), actor, query));
  });
}
