import type { Session } from "@espacios/application";
import { authorizeMember, authorizeOperator } from "@espacios/domain";

import { isAllowedOrigin, isJsonRequest } from "./origin";

/** Which edge a route belongs to (spec 0002): any signed in user, members only, or the operator only. */
export type Edge = "any" | "member" | "operator";

/** Why a request is refused, as the reason code and HTTP status of spec 0001's error table. */
export type Refusal =
  | { readonly status: 400; readonly code: "invalid_input" }
  | { readonly status: 401; readonly code: "unauthenticated" }
  | { readonly status: 403; readonly code: "forbidden" };

const UNAUTHENTICATED: Refusal = { status: 401, code: "unauthenticated" };
const FORBIDDEN: Refusal = { status: 403, code: "forbidden" };

/** No session is 401; a session on the wrong edge is 403, decided by the domain policies. */
export function checkAccess(session: Session | null, edge: Edge): Refusal | null {
  if (!session) return UNAUTHENTICATED;
  if (edge === "member" && !authorizeMember(session.actor).ok) return FORBIDDEN;
  if (edge === "operator" && !authorizeOperator(session.actor).ok) return FORBIDDEN;
  return null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** State changing API calls must come from our own origin (or none) and carry JSON. */
export function checkStateChange(method: string, headers: Headers): Refusal | null {
  if (SAFE_METHODS.has(method.toUpperCase())) return null;
  if (!isAllowedOrigin(headers)) return FORBIDDEN;
  if (!isJsonRequest(headers)) return { status: 400, code: "invalid_input" };
  return null;
}
