"use client";

import { useState } from "react";

import type { ClientKind } from "@espacios/application";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TIME_ZONE } from "@/i18n/config";
import { slugify } from "@/lib/operator/format";

import { Field } from "../../_components/field";
import { FormDialog, useFieldError } from "../../_components/form-dialog";
import { createClientAction } from "../_actions/client";
import { LogoField } from "./logo-field";

/**
 * A new client and its first member, in one transaction (spec 0005, AC-8). The code is suggested from the name until
 * the operator edits it. A person who works alone is its own member, so only a company names one.
 */
export function CreateClientDialog() {
  const t = useTranslations("operator.client.form");
  return (
    <FormDialog
      action={createClientAction}
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
      <NewClientFields />
    </FormDialog>
  );
}

function NewClientFields() {
  const t = useTranslations("operator.client.form");
  const [kind, setKind] = useState<ClientKind>("company");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const fields = { name: useFieldError("name"), slug: useFieldError("slug"), memberName: useFieldError("memberName") };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm leading-none font-medium">{t("kind")}</legend>
        <RadioGroup name="kind" value={kind} onValueChange={(value) => setKind(value as ClientKind)}>
          {(["company", "individual"] as const).map((option) => (
            <div key={option} className="flex items-center gap-2">
              <RadioGroupItem id={`client-kind-${option}`} value={option} />
              <Label htmlFor={`client-kind-${option}`}>{t(`kinds.${option}`)}</Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      <Field id="client-name" label={t("name")} error={fields.name.error}>
        <Input
          id="client-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          {...fields.name.mark}
        />
      </Field>
      <Field id="client-slug" label={t("slug")} hint={t("slugHint")} error={fields.slug.error}>
        {/* `null` until the operator types here: the code follows the name until then. */}
        <Input
          id="client-slug"
          name="slug"
          value={slug ?? slugify(name)}
          onChange={(event) => setSlug(event.target.value)}
          required
          {...fields.slug.mark}
        />
      </Field>
      <LogoField />
      {kind === "company" ? (
        <Field
          id="client-memberName"
          label={t("firstMember")}
          hint={t("firstMemberHint")}
          error={fields.memberName.error}
        >
          <Input id="client-memberName" name="memberName" required {...fields.memberName.mark} />
        </Field>
      ) : null}
    </div>
  );
}
