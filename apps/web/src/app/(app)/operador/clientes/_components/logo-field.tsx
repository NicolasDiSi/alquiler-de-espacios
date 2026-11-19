"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";

import { Field } from "../../_components/field";
import { useFieldError } from "../../_components/form-dialog";

/** An optional https URL; empty clears it. There is no upload in v1 (spec 0004, AC-4). */
export function LogoField({ defaultValue = "" }: { readonly defaultValue?: string }) {
  const t = useTranslations("operator.client.form");
  const field = useFieldError("logoUrl");
  return (
    <Field id="client-logoUrl" label={t("logo")} hint={t("logoHint")} error={field.error}>
      <Input
        id="client-logoUrl"
        name="logoUrl"
        type="url"
        inputMode="url"
        defaultValue={defaultValue}
        {...field.mark}
      />
    </Field>
  );
}
