import type { NextRequest } from "next/server";

import { listOperatorBookings } from "@espacios/application";

import { operatorReadEdge } from "@/composition";
import { decodeOperatorCursor, encodeOperatorCursor } from "@/lib/operator/bookings-cursor";
import { operatorRoute, readQuery, refuse } from "@/lib/operator/route";
import { bookingsQuery } from "@/lib/operator/schemas";

/**
 * `GET /api/v1/operator/bookings` (spec 0004, AC-10): every company's bookings with the company name, filtered by
 * `companyId`, `roomId`, `facilityId`, `status`, `from` and `to`, paged by an opaque keyset cursor (50 by default, 100
 * at most), upcoming first. A malformed cursor or filter is 400. Companies never reach this.
 */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, bookingsQuery);
    if (!query) return refuse("invalid_input");

    const { cursor, limit, ...filter } = query;
    const after = cursor === undefined ? null : decodeOperatorCursor(cursor);
    if (cursor !== undefined && !after) return refuse("invalid_input");

    const result = await listOperatorBookings(operatorReadEdge(), actor, { filter, after, limit });
    if (!result.ok) return refuse(result.reason, result.details);
    const nextCursor = result.value.next ? encodeOperatorCursor(result.value.next) : null;
    return Response.json(
      { bookings: result.value.bookings, nextCursor },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
