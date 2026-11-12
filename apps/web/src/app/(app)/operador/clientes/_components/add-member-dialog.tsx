"use client";

import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TIME_ZONE } from "@/i18n/config";

import { Field } from "../../_components/field";
import { FormDialog, useFieldMark } from "../../_components/form-dialog";
import { addMemberAction } from "../_actions/client";

/** A member of a company (spec 0005, AC-9). The server refuses a second one for a person (`individual_is_single`). */
export function AddMemberDialog({ clientId }: { readonly clientId: string }) {
  const t = useTranslations("operator.member.form");
  return (
    <FormDialog
      action={addMemberAction}
      trigger={
        <Button variant="outline">
          <UserPlus aria-hidden />
          {t("create")}
        </Button>
      }
      title={t("title")}
      description={t("description")}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
      timeZone={TIME_ZONE}
      hidden={{ clientId }}
    >
      <MemberNameField />
    </FormDialog>
  );
}

function MemberNameField() {
  const t = useTranslations("operator.member.form");
  const mark = useFieldMark("name");
  return (
    <Field id="member-name" label={t("name")}>
      <Input id="member-name" name="name" required {...mark} />
    </Field>
  );
}
