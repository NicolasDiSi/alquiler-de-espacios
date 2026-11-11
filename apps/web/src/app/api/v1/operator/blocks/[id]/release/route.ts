import type { NextRequest } from "next/server";

import { releaseBlock } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { type IdContext, operatorRoute, respond } from "@/lib/operator/route";

/** `POST /api/v1/operator/blocks/{id}/release`: the block stops blocking at once. A second release is 409. */
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => respond(await releaseBlock(operatorEdge(), actor, id), "block"));
}
