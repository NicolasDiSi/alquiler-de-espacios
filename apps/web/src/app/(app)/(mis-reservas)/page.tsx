import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { requireMember } from "@/lib/session/session";

/** The member's home (company edge). Without a session it redirects to the picker; the operator gets 403. */
export default async function HomePage() {
  await requireMember();
  const t = await getTranslations("home");

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <EmptyState icon={CalendarDays} title={t("empty.title")} description={t("empty.description")} />
    </div>
  );
}
