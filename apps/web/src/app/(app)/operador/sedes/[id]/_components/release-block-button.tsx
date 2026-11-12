"use client";

import type { OperatorBlockView } from "@espacios/application";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { ConfirmDialog } from "../../../_components/form-dialog";
import { releaseBlockAction } from "../_actions/blocks";

/** Release a block: it stops blocking at once and stays in the history (never edited or deleted). */
export function ReleaseBlockButton({
  block,
  timeZone,
}: {
  readonly block: OperatorBlockView;
  readonly timeZone: string;
}) {
  const t = useTranslations("operator.block.release");
  return (
    <ConfirmDialog
      action={releaseBlockAction}
      trigger={
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          {t("trigger")}
          <span className="sr-only">{block.reason}</span>
        </Button>
      }
      title={t("title")}
      description={t("description")}
      submitLabel={t("confirm")}
      pendingLabel={t("working")}
      timeZone={timeZone}
      hidden={{ id: block.id }}
    />
  );
}
