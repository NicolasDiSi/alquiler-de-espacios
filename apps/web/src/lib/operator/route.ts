import type { NextRequest } from "next/server";

import type { Actor, Reason, RefusalDetails, Result } from "@espacios/domain";
import { getTranslations } from "next-intl/server";
import type { z } from "zod";

import { LOCALE } from "@/i18n/config";
import { failureResponse } from "@/lib/result/http";
import { authenticateRequest } from "@/lib/session/api";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** A refusal as the API's JSON, `{ code, message }`, with the reason's status. */
export async function refuse(reason: Reason, details?: RefusalDetails): Promise<Response> {
  const t = await getTranslations({ locale: LOCALE, namespace: "errors" });
  return failureResponse(reason, t(reason), details);
}

/**
 * Every `/api/v1/operator/*` handler runs inside this (spec 0004, AC-1): CSRF checks for writes, the signed cookie, and
 * the operator role (a member is 403, no session 401). The handler gets the actor resolved on the server.
 */
export async function operatorRoute(request: NextRequest, handler: (actor: Actor) => Promise<Response>) {
  const auth = await authenticateRequest(request, "operator");
  if ("response" in auth) return auth.response;
  return handler(auth.session.actor);
}

/** The JSON body parsed by a schema, or `null` when it is not JSON or does not fit. */
export async function readBody<S extends z.ZodType>(request: NextRequest, schema: S): Promise<z.output<S> | null> {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The query string parsed by a schema, or `null`. */
export function readQuery<S extends z.ZodType>(request: NextRequest, schema: S): z.output<S> | null {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  return parsed.success ? parsed.data : null;
}

/**
 * A use case result as a response: the value under `key` (200, or 201 with a `Location` for a new record), or the
 * failure with its reason's status. The body never carries a driver error.
 */
export async function respond<T>(result: Result<T>, key: string, created?: (value: T) => string): Promise<Response> {
  if (!result.ok) return refuse(result.reason, result.details);
  const headers = new Headers(NO_STORE);
  if (created) headers.set("Location", created(result.value));
  return Response.json({ [key]: result.value }, { status: created ? 201 : 200, headers });
}

/** The `{id}` of a dynamic route. */
export type IdContext = { readonly params: Promise<{ readonly id: string }> };
