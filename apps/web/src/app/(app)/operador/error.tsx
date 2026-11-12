"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** An operator page could not be read: a clear message and a retry, never an empty list (spec 0005, AC-14). */
export default function OperatorError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("operator.error");

  return (
    <EmptyState
      icon={CircleAlert}
      title={t("title")}
      description={t("description")}
      action={
        <Button type="button" onClick={() => retry()}>
          {t("retry")}
        </Button>
      }
    />
  );
}
