"use client";

import type { OperatorRoomView } from "@espacios/application";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { FormDialog } from "../../../_components/form-dialog";
import { updateRoomAction } from "../_actions/rooms";
import { RoomFields } from "./room-fields";

export function EditRoomDialog({ room, timeZone }: { readonly room: OperatorRoomView; readonly timeZone: string }) {
  const t = useTranslations("operator.room.form");
  return (
    <FormDialog
      action={updateRoomAction}
      trigger={
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          {t("edit")}
          <span className="sr-only">{room.name}</span>
        </Button>
      }
      title={t("editTitle")}
      description={t("description")}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
      timeZone={timeZone}
      hidden={{ id: room.id }}
    >
      <RoomFields name={room.name} capacity={room.capacity} />
    </FormDialog>
  );
}
