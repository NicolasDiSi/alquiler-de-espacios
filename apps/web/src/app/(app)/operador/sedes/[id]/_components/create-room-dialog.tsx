"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Field } from "../../../_components/field";
import { FormDialog, useFieldMark } from "../../../_components/form-dialog";
import { createRoomAction } from "../_actions/rooms";
import { RoomFields } from "./room-fields";

/** A new room of this sede. "Disponible desde" is optional: empty means now, earlier backfills the metrics. */
export function CreateRoomDialog({ facilityId, timeZone }: { readonly facilityId: string; readonly timeZone: string }) {
  const t = useTranslations("operator.room.form");
  return (
    <FormDialog
      action={createRoomAction}
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
      timeZone={timeZone}
      hidden={{ facilityId }}
    >
      <RoomFields />
      <ActiveFromField />
    </FormDialog>
  );
}

function ActiveFromField() {
  const t = useTranslations("operator.room.form");
  const mark = useFieldMark("activeFrom");
  return (
    <Field id="room-activeFrom" label={t("activeFrom")} hint={t("activeFromHint")}>
      <Input id="room-activeFrom" name="activeFrom" type="date" {...mark} />
    </Field>
  );
}
