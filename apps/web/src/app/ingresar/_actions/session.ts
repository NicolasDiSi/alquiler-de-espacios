"use server";

import { redirect } from "next/navigation";

import { resolveSession } from "@espacios/application";
import type { UserId } from "@espacios/domain";

import { userDirectory } from "@/composition";
import { endSession, homePathFor, SIGN_IN_PATH, startSession } from "@/lib/session/session";

export type SignInState = { readonly error: "unknownUser" | null };

/** The longest id we accept from the form; seeded and generated ids are far shorter. */
const MAX_USER_ID_LENGTH = 128;

/**
 * `signInAs(userId)` (spec 0001): the picker posts only a user id. The company is looked up from that user's row,
 * so nothing the browser sends can choose it. Next.js checks the Origin of every Server Action.
 */
export async function signInAs(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const userId = formData.get("userId");
  if (typeof userId !== "string" || userId === "" || userId.length > MAX_USER_ID_LENGTH) {
    return { error: "unknownUser" };
  }
  const session = await resolveSession(userDirectory(), userId as UserId);
  if (!session) return { error: "unknownUser" };

  await startSession(session.actor.userId);
  redirect(homePathFor(session.actor));
}

/** "Cambiar de usuario": clears the cookie and goes back to the picker. */
export async function signOut(): Promise<void> {
  await endSession();
  redirect(SIGN_IN_PATH);
}
