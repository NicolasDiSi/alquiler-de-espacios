"use client";

import type { OperatorClientView } from "@espacios/application";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { TIME_ZONE } from "@/i18n/config";

import { ConfirmDialog } from "../../_components/form-dialog";
import { deactivateClientAction, reactivateClientAction } from "../_actions/client";

/** Its members stop booking but keep their list and can cancel. A client can come back (unlike rooms). */
export function DeactivateClientButton({ client }: { readonly client: OperatorClientView }) {
  const t = useTranslations("operator.client.deactivate");
  return (
    <ConfirmDialog
      action={deactivateClientAction}
      trigger={<Button variant="destructive">{t("trigger")}</Button>}
      title={t("title")}
      description={t("description", { name: client.name })}
      submitLabel={t("confirm")}
      pendingLabel={t("working")}
      submitVariant="destructive"
      timeZone={TIME_ZONE}
      hidden={{ id: client.id }}
    />
  );
}

export function ReactivateClientButton({ client }: { readonly client: OperatorClientView }) {
  const t = useTranslations("operator.client.reactivate");
  return (
    <ConfirmDialog
      action={reactivateClientAction}
      trigger={<Button variant="outline">{t("trigger")}</Button>}
      title={t("title")}
      description={t("description", { name: client.name })}
      submitLabel={t("confirm")}
      pendingLabel={t("working")}
      timeZone={TIME_ZONE}
      hidden={{ id: client.id }}
    />
  );
}
