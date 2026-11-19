import type { NextRequest } from "next/server";

import { reactivateClient } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { type IdContext, operatorRoute, respond } from "@/lib/operator/route";

/** `POST /api/v1/operator/companies/{id}/reactivate`: a client may come back; rooms and facilities never do. */
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => respond(await reactivateClient(operatorEdge(), actor, id), "company"));
}
