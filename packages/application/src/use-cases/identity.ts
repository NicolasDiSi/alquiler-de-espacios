import type { Actor, UserId } from "@espacios/domain";

import type { DirectoryUser, UserDirectory } from "../ports/queries/user-directory";

/** The signed in user: the actor every use case receives, plus the names the header shows. */
export type Session = {
  readonly actor: Actor;
  readonly userName: string;
  readonly companyName: string | null;
};

/**
 * Turns the user id from a verified session cookie into a session. The company comes from the user's row, never
 * from the request. A user that no longer exists gives `null`, which the edges treat as signed out (401).
 */
export async function resolveSession(directory: UserDirectory, userId: UserId): Promise<Session | null> {
  const user = await directory.findUser(userId);
  return user ? toSession(user) : null;
}

function toSession(user: DirectoryUser): Session {
  if (user.role === "operator") {
    return { actor: { role: "operator", userId: user.id }, userName: user.name, companyName: null };
  }
  return {
    actor: { role: "member", userId: user.id, tenantId: user.company.id },
    userName: user.name,
    companyName: user.company.name,
  };
}
