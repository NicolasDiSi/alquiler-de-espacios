"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { FieldErrorText } from "@/components/field-error-text";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DAY_MARKS, WEEKDAYS_MONDAY_FIRST, weekdayKey, zoneLabel, zoneOptions } from "@/lib/operator/format";

import { Field } from "../../_components/field";
import { useFieldError } from "../../_components/form-dialog";

export type FacilityFieldValues = {
  readonly name: string;
  readonly address: string;
  readonly timeZone: string;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly openWeekdays: readonly number[];
};

/** The fields of a sede (spec 0005, AC-3), shared by the create and edit dialogs. They post what `facilityForm` reads. */
export function FacilityFields({ defaults }: { readonly defaults: FacilityFieldValues }) {
  const t = useTranslations("operator.facility.form");
  const days = useTranslations("operator.weekdays");
  const [weekdays, setWeekdays] = useState<string[]>(defaults.openWeekdays.map(String));
  const fields = {
    name: useFieldError("name"),
    address: useFieldError("address"),
    timeZone: useFieldError("timeZone"),
    opensAt: useFieldError("opensAt"),
    closesAt: useFieldError("closesAt"),
    openWeekdays: useFieldError("openWeekdays"),
  };

  return (
    <div className="flex flex-col gap-4">
      <Field id="facility-name" label={t("name")} error={fields.name.error}>
        <Input id="facility-name" name="name" defaultValue={defaults.name} required {...fields.name.mark} />
      </Field>
      <Field id="facility-address" label={t("address")} hint={t("addressHint")} error={fields.address.error}>
        <Input id="facility-address" name="address" defaultValue={defaults.address} {...fields.address.mark} />
      </Field>
      <Field id="facility-timeZone" label={t("timeZone")} error={fields.timeZone.error}>
        <NativeSelect id="facility-timeZone" name="timeZone" defaultValue={defaults.timeZone} {...fields.timeZone.mark}>
          {zoneOptions(defaults.timeZone).map((zone) => (
            <option key={zone} value={zone}>
              {zoneLabel(zone)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="facility-opensAt" label={t("opensAt")} error={fields.opensAt.error}>
          <NativeSelect id="facility-opensAt" name="opensAt" defaultValue={defaults.opensAt} {...fields.opensAt.mark}>
            {DAY_MARKS.slice(0, -1).map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="facility-closesAt" label={t("closesAt")} error={fields.closesAt.error}>
          <NativeSelect
            id="facility-closesAt"
            name="closesAt"
            defaultValue={defaults.closesAt}
            {...fields.closesAt.mark}
          >
            {DAY_MARKS.slice(1).map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm leading-none font-medium">{t("weekdays")}</legend>
        <ToggleGroup
          type="multiple"
          variant="outline"
          value={weekdays}
          onValueChange={setWeekdays}
          {...fields.openWeekdays.mark}
        >
          {WEEKDAYS_MONDAY_FIRST.map((day) => (
            <ToggleGroupItem
              key={day}
              value={String(day)}
              aria-label={days(`long.${weekdayKey(day)}`)}
              className="text-muted-foreground data-[state=on]:border-primary data-[state=on]:bg-secondary data-[state=on]:text-primary w-9 font-medium"
            >
              {days(`short.${weekdayKey(day)}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <input type="hidden" name="openWeekdays" value={weekdays.join(",")} />
        <FieldErrorText error={fields.openWeekdays.error} />
      </fieldset>
    </div>
  );
}
