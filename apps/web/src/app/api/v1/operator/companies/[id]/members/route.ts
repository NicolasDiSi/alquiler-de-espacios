import type { NextRequest } from "next/server";

import { addMember, listMembers } from "@espacios/application";

import { operatorEdge } from "@/composition";
import { type IdContext, operatorRoute, readBody, refuse, respond } from "@/lib/operator/route";
import { memberBody } from "@/lib/operator/schemas";

export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => respond(await listMembers(operatorEdge(), actor, id), "members"));
}

/** An `individual` holds one member: a second is 409 `individual_is_single`. A company accepts as many as needed. */
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  return operatorRoute(request, async (actor) => {
    const body = await readBody(request, memberBody);
    if (!body) return refuse("invalid_input");
    return respond(
      await addMember(operatorEdge(), actor, id, body.name),
      "member",
      () => `/api/v1/operator/companies/${id}/members`,
    );
  });
}
