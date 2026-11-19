import type { NextRequest } from "next/server";

import type { Session } from "@espacios/application";
import { getTranslations } from "next-intl/server";

import { LOCALE } from "@/i18n/config";
import { failureResponse } from "@/lib/result/http";

import { checkAccess, checkStateChange, type Edge, type Refusal } from "./access";
import { SESSION_COOKIE, sessionFromCookie } from "./session";

/**
 * The guard every `/api/v1` Route Handler calls first: the CSRF checks for writes, then the signed cookie, then the
 * edge's role. A refusal is already the JSON response, `{ code, message }`, with its status.
 */
export async function authenticateRequest(
  request: NextRequest,
  edge: Edge,
): Promise<{ readonly session: Session } | { readonly response: Response }> {
  const refusedWrite = checkStateChange(request.method, request.headers);
  if (refusedWrite) return { response: await refusalResponse(refusedWrite) };

  const session = await sessionFromCookie(request.cookies.get(SESSION_COOKIE)?.value);
  const refused = checkAccess(session, edge);
  if (refused) return { response: await refusalResponse(refused) };
  // checkAccess refuses a missing session, so here it is always set.
  return { session: session as Session };
}

async function refusalResponse(refusal: Refusal): Promise<Response> {
  const t = await getTranslations({ locale: LOCALE, namespace: "errors" });
  return failureResponse(refusal, t(refusal));
}
