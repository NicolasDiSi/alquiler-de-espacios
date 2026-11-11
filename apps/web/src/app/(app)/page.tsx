import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";

export default function HomePage() {
  const t = useTranslations("home");

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
