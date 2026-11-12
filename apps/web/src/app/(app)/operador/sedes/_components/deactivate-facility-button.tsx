"use client";

import { useId } from "react";

import type { OperatorFacilityView } from "@espacios/application";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { ConfirmDialog } from "../../_components/form-dialog";
import { deactivateFacilityAction } from "../_actions/facility";

/**
 * Retire a sede for good. While it has active rooms the action cannot succeed, so it is disabled and says what to do
 * first, instead of failing after a click (`status-colors-and-errors`). The server still refuses it the same way.
 */
export function DeactivateFacilityButton({ facility }: { readonly facility: OperatorFacilityView }) {
  const t = useTranslations("operator.facility.deactivate");
  const reasonId = useId();
  const trigger = (
    <Button variant="ghost" className="text-destructive hover:text-destructive">
      {t("trigger")}
    </Button>
  );

  if (facility.activeRooms > 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="ghost" disabled aria-describedby={reasonId}>
          {t("trigger")}
        </Button>
        <p id={reasonId} className="text-muted-foreground text-right text-xs sm:whitespace-nowrap">
          {t("blockedByRooms", { count: facility.activeRooms })}
        </p>
      </div>
    );
  }
  return (
    <ConfirmDialog
      action={deactivateFacilityAction}
      trigger={trigger}
      title={t("title")}
      description={t("description", { name: facility.name })}
      submitLabel={t("confirm")}
      pendingLabel={t("working")}
      submitVariant="destructive"
      timeZone={facility.timeZone}
      hidden={{ id: facility.id }}
    />
  );
}
