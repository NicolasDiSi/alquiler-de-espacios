"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** Mis reservas could not be read (the database was busy): a clear message and a retry that renders it again. */
export default function MyBookingsError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("home.error");

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
