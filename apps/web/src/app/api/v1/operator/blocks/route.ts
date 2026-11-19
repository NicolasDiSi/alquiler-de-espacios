import type { NextRequest } from "next/server";

import { createBlock, listBlocks } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { operatorRoute, readBody, readQuery, refuse, respond } from "@/lib/operator/route";
import { blockBody, blocksQuery } from "@/lib/operator/schemas";

/** `GET /api/v1/operator/blocks?facilityId=&roomId=&includeReleased=` (spec 0004). Companies never reach this. */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, blocksQuery);
    if (!query) return refuse("invalid_input");
    const { facilityId, roomId, includeReleased } = query;
    const filter = { includeReleased, ...(facilityId ? { facilityId } : {}), ...(roomId ? { roomId } : {}) };
    return respond(await listBlocks(operatorEdge(), actor, filter), "blocks");
  });
}

/** `POST /api/v1/operator/blocks`: closes a room (or, with no `roomId`, the whole facility). 201 with `Location`. */
export function POST(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const body = await readBody(request, blockBody);
    if (!body) return refuse("invalid_input");
    const result = await createBlock(operatorEdge(), actor, { ...body, roomId: body.roomId ?? null });
    return respond(result, "block", (block) => `/api/v1/operator/blocks/${block.id}`);
  });
}
