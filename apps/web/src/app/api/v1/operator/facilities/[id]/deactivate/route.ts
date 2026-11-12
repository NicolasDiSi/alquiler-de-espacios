import type { NextRequest } from "next/server";

import { deactivateFacility } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { type IdContext, operatorRoute, respond } from "@/lib/operator/route";

/** `POST /api/v1/operator/facilities/{id}/deactivate`: nothing is deleted, the record is switched off (spec 0004). */
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) =>
    respond(await deactivateFacility(operatorEdge(), actor, id), "facility"),
  );
}
