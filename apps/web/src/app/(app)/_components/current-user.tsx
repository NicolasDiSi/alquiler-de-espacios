import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { signOut } from "@/app/ingresar/_actions/session";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session/session";

/** Who is signed in, and the way to switch users. Renders nothing without a session (the pages redirect then). */
export async function CurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const t = await getTranslations("session");

  return (
    <div className="flex items-center gap-2">
      <p className="hidden text-right leading-tight sm:block">
        <span className="sr-only">{t("label")}</span>
        <span className="block font-medium">{session.userName}</span>
        <span className="text-muted-foreground block text-xs">{session.companyName ?? t("operator")}</span>
      </p>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          <LogOut aria-hidden />
          {t("switchUser")}
        </Button>
      </form>
    </div>
  );
}
