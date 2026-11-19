import type { NextRequest } from "next/server";

import { createFacility, listFacilities } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { operatorRoute, readBody, readQuery, refuse, respond } from "@/lib/operator/route";
import { facilityBody, inactiveQuery } from "@/lib/operator/schemas";

/** `GET /api/v1/operator/facilities?includeInactive=` (spec 0004): every facility, by name. */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, inactiveQuery);
    if (!query) return refuse("invalid_input");
    return respond(await listFacilities(operatorEdge(), actor, query.includeInactive), "facilities");
  });
}

/** `POST /api/v1/operator/facilities`: 201 with `Location`. A taken name is 409 `already_exists`. */
export function POST(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const body = await readBody(request, facilityBody);
    if (!body) return refuse("invalid_input");
    const result = await createFacility(operatorEdge(), actor, { ...body, address: body.address ?? null });
    return respond(result, "facility", (facility) => `/api/v1/operator/facilities/${facility.id}`);
  });
}
