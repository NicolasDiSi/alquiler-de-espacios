import type { NextRequest } from "next/server";

import { roomCatalog } from "@/composition";
import { authenticateRequest } from "@/lib/session/api";

/** `GET /api/v1/rooms`: every room (id, name, capacity) for any signed in user (spec 0001, API surface). */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, "any");
  if ("response" in auth) return auth.response;

  const rooms = await roomCatalog().listRooms();
  return Response.json({ rooms }, { headers: { "Cache-Control": "private, no-store" } });
}
