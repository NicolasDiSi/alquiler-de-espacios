"use client";

import type { OperatorClientView } from "@espacios/application";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TIME_ZONE } from "@/i18n/config";

import { Field } from "../../_components/field";
import { FormDialog, useFieldMark } from "../../_components/form-dialog";
import { updateClientAction } from "../_actions/client";
import { LogoField } from "./logo-field";

/** Name and logo are the only things a client changes; its code and kind never do (spec 0005, AC-9). */
export function EditClientDialog({ client }: { readonly client: OperatorClientView }) {
  const t = useTranslations("operator.client.form");
  return (
    <FormDialog
      action={updateClientAction}
      trigger={
        <Button variant="outline">
          <Pencil aria-hidden />
          {t("edit")}
        </Button>
      }
      title={t("editTitle")}
      description={t("editDescription")}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
      timeZone={TIME_ZONE}
      hidden={{ id: client.id }}
    >
      <NameField defaultValue={client.name} />
      <LogoField defaultValue={client.logoUrl ?? ""} />
    </FormDialog>
  );
}

function NameField({ defaultValue }: { readonly defaultValue: string }) {
  const t = useTranslations("operator.client.form");
  const mark = useFieldMark("name");
  return (
    <Field id="client-name" label={t("name")}>
      <Input id="client-name" name="name" defaultValue={defaultValue} required {...mark} />
    </Field>
  );
}
