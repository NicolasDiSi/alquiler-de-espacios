import type { NextRequest } from "next/server";

import { getCompanyMetrics } from "@espacios/application";

import { operatorReadEdge } from "@/composition";
import { operatorRoute, readQuery, refuse, respondBody } from "@/lib/operator/route";
import { companyMetricsQuery } from "@/lib/operator/schemas";

/** `GET /api/v1/operator/metrics/companies?from&to&kind` (AC-12): usage of every client, idle ones too. Only the operator reaches it; a malformed or unreal day is 400 and a reversed or too long range is 422. */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, companyMetricsQuery);
    if (!query) return refuse("invalid_input");
    return respondBody(await getCompanyMetrics(operatorReadEdge(), actor, query));
  });
}
