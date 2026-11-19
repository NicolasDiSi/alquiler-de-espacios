"use client";

import type { OperatorFacilityView, OperatorRoomView } from "@espacios/application";
import { CalendarOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { zoneLabel } from "@/lib/operator/format";

import { createBlockAction } from "../../../_actions/blocks";
import { BlockFields } from "../../../_components/block-fields";
import { FormDialog } from "../../../_components/form-dialog";

/** A block on the whole sede or one room (spec 0005, AC-7). Days and times are read in the sede's zone. */
export function CreateBlockDialog({
  facility,
  rooms,
}: {
  readonly facility: OperatorFacilityView;
  /** The rooms that can still be blocked (the active ones). */
  readonly rooms: readonly OperatorRoomView[];
}) {
  const t = useTranslations("operator.block.form");
  return (
    <FormDialog
      action={createBlockAction}
      trigger={
        <Button variant="outline">
          <CalendarOff aria-hidden />
          {t("create")}
        </Button>
      }
      title={t("title")}
      description={t("description", { zone: zoneLabel(facility.timeZone) })}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
      timeZone={facility.timeZone}
      hidden={{ facilityId: facility.id }}
    >
      <BlockFields facility={facility} rooms={rooms} />
    </FormDialog>
  );
}
