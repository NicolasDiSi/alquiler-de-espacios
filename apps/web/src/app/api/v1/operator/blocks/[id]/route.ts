import type { NextRequest } from "next/server";

import { getBlock } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { type IdContext, operatorRoute, respond } from "@/lib/operator/route";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => respond(await getBlock(operatorEdge(), actor, id), "block"));
}
