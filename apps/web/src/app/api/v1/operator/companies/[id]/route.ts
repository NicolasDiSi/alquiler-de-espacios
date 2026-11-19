import type { NextRequest } from "next/server";

import { getClient, updateClient } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { type IdContext, operatorRoute, readBody, refuse, respond } from "@/lib/operator/route";
import { clientPatch } from "@/lib/operator/schemas";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => respond(await getClient(operatorEdge(), actor, id), "company"));
}

export async function PATCH(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => {
    const body = await readBody(request, clientPatch);
    if (!body) return refuse("invalid_input");
    return respond(await updateClient(operatorEdge(), actor, id, JSON.parse(JSON.stringify(body))), "company");
  });
}
