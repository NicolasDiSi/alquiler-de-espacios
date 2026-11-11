import { cache } from "react";

import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import { resolveSession, type Session } from "@espacios/application";
import {
  type Actor,
  authorizeMember,
  authorizeOperator,
  type MemberActor,
  type OperatorActor,
  type UserId,
} from "@espacios/domain";

import { sessionSecret, userDirectory } from "@/composition";

import { SESSION_TTL_SECONDS, signSession, verifySession } from "./token";

export const SESSION_COOKIE = "espacios_session";
export const SIGN_IN_PATH = "/ingresar";

/** Where each role lands after picking a user (spec 0002). */
export function homePathFor(actor: Actor): string {
  return actor.role === "operator" ? "/operador" : "/";
}

/** The session behind a cookie value: verified signature and expiry, and a user that still exists. */
export async function sessionFromCookie(value: string | undefined, now = new Date()): Promise<Session | null> {
  if (!value) return null;
  const userId = verifySession(value, sessionSecret(), now);
  return userId ? resolveSession(userDirectory(), userId as UserId) : null;
}

/** The current request's session, read once per render. The company always comes from here, never the request. */
export const getSession = cache(
  async (): Promise<Session | null> => sessionFromCookie((await cookies()).get(SESSION_COOKIE)?.value),
);

/** For pages and Server Actions of the company edge: no session goes to the picker, the operator gets 403. */
export async function requireMember(): Promise<{ session: Session; actor: MemberActor }> {
  const session = await getSession();
  if (!session) redirect(SIGN_IN_PATH);
  const decision = authorizeMember(session.actor);
  if (!decision.ok) forbidden();
  return { session, actor: decision.value };
}

/** For pages of the operator edge: no session goes to the picker, a member gets 403. */
export async function requireOperator(): Promise<{ session: Session; actor: OperatorActor }> {
  const session = await getSession();
  if (!session) redirect(SIGN_IN_PATH);
  const decision = authorizeOperator(session.actor);
  if (!decision.ok) forbidden();
  return { session, actor: decision.value };
}

/** Sets the signed cookie. `Secure` follows the request protocol, so `next start` over http still works. */
export async function startSession(userId: UserId): Promise<void> {
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(SESSION_COOKIE, signSession(userId, sessionSecret(), new Date()), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
