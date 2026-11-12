"use client";

import type { OperatorRoomView } from "@espacios/application";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { ConfirmDialog } from "../../../_components/form-dialog";
import { deactivateRoomAction } from "../_actions/rooms";

/** Retire a room for good. With future bookings it is refused and the dialog lists them (AC-6). */
export function DeactivateRoomButton({
  room,
  timeZone,
}: {
  readonly room: OperatorRoomView;
  readonly timeZone: string;
}) {
  const t = useTranslations("operator.room.deactivate");
  return (
    <ConfirmDialog
      action={deactivateRoomAction}
      trigger={
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          {t("trigger")}
          <span className="sr-only">{room.name}</span>
        </Button>
      }
      title={t("title", { name: room.name })}
      description={t("description", { name: room.name })}
      submitLabel={t("confirm")}
      pendingLabel={t("working")}
      submitVariant="destructive"
      timeZone={timeZone}
      hidden={{ id: room.id }}
    />
  );
}
