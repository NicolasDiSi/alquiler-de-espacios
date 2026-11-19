import { getSession, homePathFor } from "@/lib/session/session";

import { BrandLink } from "./brand-link";
import { RoleNav } from "./role-nav";

/*
 * The only parts of the sidebar that read the session, each inside its own `Suspense` boundary in the layout (like
 * `CurrentUser`), so the layout itself reads no cookies. `getSession` is cached per request: one read for both.
 */

/** The sections of the signed in role. No session shows none (the pages redirect then). */
export async function CurrentNav() {
  const session = await getSession();
  return session ? <RoleNav role={session.actor.role} /> : null;
}

/** The product name, linking to the role's home: `/operador` for the operator, `/` for a member (spec 0002). */
export async function CurrentBrand() {
  const session = await getSession();
  return <BrandLink href={session ? homePathFor(session.actor) : "/"} />;
}
