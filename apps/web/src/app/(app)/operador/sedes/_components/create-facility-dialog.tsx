"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { TIME_ZONE } from "@/i18n/config";

import { FormDialog } from "../../_components/form-dialog";
import { createFacilityAction } from "../_actions/facility";
import { FacilityFields } from "./facility-fields";

/** A new sede opens Monday to Friday, 09:00 to 18:00, in Buenos Aires until the operator says otherwise. */
const DEFAULTS = {
  name: "",
  address: "",
  timeZone: TIME_ZONE,
  opensAt: "09:00",
  closesAt: "18:00",
  openWeekdays: [1, 2, 3, 4, 5],
};

export function CreateFacilityDialog() {
  const t = useTranslations("operator.facility.form");
  return (
    <FormDialog
      action={createFacilityAction}
      trigger={
        <Button>
          <Plus aria-hidden />
          {t("create")}
        </Button>
      }
      title={t("createTitle")}
      description={t("description")}
      submitLabel={t("createSubmit")}
      pendingLabel={t("creating")}
      timeZone={TIME_ZONE}
    >
      <FacilityFields defaults={DEFAULTS} />
    </FormDialog>
  );
}
