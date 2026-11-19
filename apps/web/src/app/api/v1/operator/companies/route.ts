import type { NextRequest } from "next/server";

import { createClient, listClients } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { operatorRoute, readBody, readQuery, refuse, respond } from "@/lib/operator/route";
import { clientBody, inactiveQuery } from "@/lib/operator/schemas";

/** `GET /api/v1/operator/companies?includeInactive=` (spec 0004): every client, companies and individuals. */
export function GET(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const query = readQuery(request, inactiveQuery);
    if (!query) return refuse("invalid_input");
    return respond(await listClients(operatorEdge(), actor, query.includeInactive), "companies");
  });
}

/** `POST /api/v1/operator/companies`: a client and its first member in one transaction. 201 with `Location`. */
export function POST(request: NextRequest) {
  return operatorRoute(request, async (actor) => {
    const body = await readBody(request, clientBody);
    if (!body) return refuse("invalid_input");
    const { member, logoUrl, ...rest } = body;
    const result = await createClient(operatorEdge(), actor, {
      ...rest,
      logoUrl: logoUrl ?? null,
      ...(member ? { memberName: member.name } : {}),
    });
    return respond(result, "company", ({ client }) => `/api/v1/operator/companies/${client.id}`);
  });
}
