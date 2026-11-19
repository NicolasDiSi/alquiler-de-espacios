import type { NextRequest } from "next/server";

import { getFacility, updateFacility } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { type IdContext, operatorRoute, readBody, refuse, respond } from "@/lib/operator/route";
import { facilityPatch } from "@/lib/operator/schemas";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => respond(await getFacility(operatorEdge(), actor, id), "facility"));
}

export async function PATCH(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => {
    const body = await readBody(request, facilityPatch);
    if (!body) return refuse("invalid_input");
    // `exactOptionalPropertyTypes`: only the keys the operator sent reach the patch.
    return respond(await updateFacility(operatorEdge(), actor, id, JSON.parse(JSON.stringify(body))), "facility");
  });
}
