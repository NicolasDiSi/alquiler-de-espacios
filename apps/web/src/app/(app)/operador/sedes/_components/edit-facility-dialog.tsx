"use client";

import type { OperatorFacilityView } from "@espacios/application";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { FormDialog } from "../../_components/form-dialog";
import { updateFacilityAction } from "../_actions/facility";
import { FacilityFields } from "./facility-fields";

/** Edit a sede. A change of zone, hours or days that strands a booking is refused with the list (AC-4). */
export function EditFacilityDialog({ facility }: { readonly facility: OperatorFacilityView }) {
  const t = useTranslations("operator.facility.form");
  return (
    <FormDialog
      action={updateFacilityAction}
      trigger={
        <Button variant="outline">
          <Pencil aria-hidden />
          {t("edit")}
        </Button>
      }
      title={t("editTitle")}
      description={t("description")}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
      timeZone={facility.timeZone}
      hidden={{ id: facility.id }}
    >
      <FacilityFields defaults={{ ...facility, address: facility.address ?? "" }} />
    </FormDialog>
  );
}
