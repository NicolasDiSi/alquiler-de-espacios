"use client";

import type { OperatorFacilityView } from "@espacios/application";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { ConfirmDialog } from "../../_components/form-dialog";
import { deactivateFacilityAction } from "../_actions/facility";

/**
 * Retire a sede for good. Always offered: the use case decides, and a sede that still has active rooms is refused with
 * `facility_has_active_rooms`, which opens the error dialog on top of the confirmation (spec 0011) and says what to
 * do first.
 */
export function DeactivateFacilityButton({ facility }: { readonly facility: OperatorFacilityView }) {
  const t = useTranslations("operator.facility.deactivate");
  return (
    <ConfirmDialog
      action={deactivateFacilityAction}
      trigger={
        <Button variant="ghost" className="text-destructive hover:text-destructive">
          {t("trigger")}
        </Button>
      }
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
