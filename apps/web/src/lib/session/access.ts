import type { Session } from "@espacios/application";
import { authorizeMember, authorizeOperator, type Reason } from "@espacios/domain";

import { isAllowedOrigin, isJsonRequest } from "./origin";

/** Which edge a route belongs to (spec 0002): any signed in user, members only, or the operator only. */
export type Edge = "any" | "member" | "operator";

/** Why a request is refused, as a reason of spec 0001's error table (`reasonToHttp` gives its status). */
export type Refusal = Extract<Reason, "invalid_input" | "unauthenticated" | "forbidden">;

/** No session is 401; a session on the wrong edge is 403, decided by the domain policies. */
export function checkAccess(session: Session | null, edge: Edge): Refusal | null {
  if (!session) return "unauthenticated";
  if (edge === "member" && !authorizeMember(session.actor).ok) return "forbidden";
  if (edge === "operator" && !authorizeOperator(session.actor).ok) return "forbidden";
  return null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** State changing API calls must come from our own origin (or none) and carry JSON. */
export function checkStateChange(method: string, headers: Headers): Refusal | null {
  if (SAFE_METHODS.has(method.toUpperCase())) return null;
  if (!isAllowedOrigin(headers)) return "forbidden";
  if (!isJsonRequest(headers)) return "invalid_input";
  return null;
}
