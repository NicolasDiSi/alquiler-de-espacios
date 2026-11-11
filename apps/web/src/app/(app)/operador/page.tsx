import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { requireOperator } from "@/lib/session/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator");
  return { title: t("title") };
}

/** The operator's home (operator edge), a placeholder until the dashboard ships. A member gets 403. */
export default async function OperatorPage() {
  await requireOperator();
  const t = await getTranslations("operator");

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <EmptyState icon={ChartColumn} title={t("empty.title")} description={t("empty.description")} />
    </div>
  );
}
