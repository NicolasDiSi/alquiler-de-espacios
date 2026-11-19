import { getTranslations } from "next-intl/server";

import { getSession } from "@/lib/session/session";

import { AccountMenu } from "./account-menu";
import { SearchDialog } from "./search-dialog";

/*
 * The header leaves that read the session, each inside its own `Suspense` boundary in the layout (like `CurrentNav`),
 * so the layout itself reads no cookies. `getSession` is cached per request.
 */

/** Who is signed in, as an avatar with the way to switch users. Nothing without a session (the pages redirect then). */
export async function CurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const t = await getTranslations("session");
  return <AccountMenu name={session.userName} detail={session.companyName ?? t("operator")} />;
}

/** The search over the signed in role's sections. */
export async function CurrentSearch() {
  const session = await getSession();
  return <SearchDialog viewer={session?.actor.role ?? null} />;
}
