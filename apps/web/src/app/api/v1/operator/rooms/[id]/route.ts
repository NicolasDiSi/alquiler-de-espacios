import type { NextRequest } from "next/server";

import { getRoom, updateRoom } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { type IdContext, operatorRoute, readBody, refuse, respond } from "@/lib/operator/route";
import { roomPatch } from "@/lib/operator/schemas";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => respond(await getRoom(operatorEdge(), actor, id), "room"));
}

export async function PATCH(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => {
    const body = await readBody(request, roomPatch);
    if (!body) return refuse("invalid_input");
    return respond(await updateRoom(operatorEdge(), actor, id, JSON.parse(JSON.stringify(body))), "room");
  });
}
