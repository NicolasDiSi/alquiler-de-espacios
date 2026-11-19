import type { NextRequest } from "next/server";

import { createRoom, listRooms } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { operatorRoute, readBody, readQuery, refuse, respond } from "@/lib/operator/route";
import { roomBody, roomsQuery } from "@/lib/operator/schemas";

/** `GET /api/v1/operator/rooms?facilityId=&includeInactive=` (spec 0004). */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, roomsQuery);
    if (!query) return refuse("invalid_input");
    const { facilityId, includeInactive } = query;
    const filter = facilityId ? { facilityId, includeInactive } : { includeInactive };
    return respond(await listRooms(operatorEdge(), actor, filter), "rooms");
  });
}

/** `POST /api/v1/operator/rooms`: 201 with `Location`. A room of an inactive facility is 409 `facility_inactive`. */
export function POST(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const body = await readBody(request, roomBody);
    if (!body) return refuse("invalid_input");
    const { activeFrom, ...rest } = body;
    const result = await createRoom(operatorEdge(), actor, activeFrom ? { ...rest, activeFrom } : rest);
    return respond(result, "room", (room) => `/api/v1/operator/rooms/${room.id}`);
  });
}
