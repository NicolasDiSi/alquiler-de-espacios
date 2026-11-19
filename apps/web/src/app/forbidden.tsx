import Link from "next/link";

import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getSession, homePathFor, SIGN_IN_PATH } from "@/lib/session/session";

/** The 403 page `forbidden()` renders: a member on an operator page, or the operator on a member page. */
export default async function Forbidden() {
  const [t, session] = await Promise.all([getTranslations("forbidden"), getSession()]);

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-2 p-4 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-md">{t("description")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {session ? (
          <Button asChild>
            <Link prefetch={false} href={homePathFor(session.actor)}>
              {t("home")}
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link prefetch={false} href={SIGN_IN_PATH}>
            {t("switchUser")}
          </Link>
        </Button>
      </div>
    </main>
  );
}
