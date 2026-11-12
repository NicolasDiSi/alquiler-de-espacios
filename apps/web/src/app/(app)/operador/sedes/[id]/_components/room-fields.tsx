"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";

import { Field } from "../../../_components/field";
import { useFieldMark } from "../../../_components/form-dialog";

/** Name and capacity, the two fields a room keeps editable (spec 0005, AC-6). */
export function RoomFields({ name = "", capacity = "" }: { readonly name?: string; readonly capacity?: number | "" }) {
  const t = useTranslations("operator.room.form");
  const nameMark = useFieldMark("name");
  const capacityMark = useFieldMark("capacity");
  return (
    <>
      <Field id="room-name" label={t("name")}>
        <Input id="room-name" name="name" defaultValue={name} required {...nameMark} />
      </Field>
      <Field id="room-capacity" label={t("capacity")}>
        <Input
          id="room-capacity"
          name="capacity"
          type="number"
          min={1}
          inputMode="numeric"
          defaultValue={capacity}
          required
          {...capacityMark}
        />
      </Field>
    </>
  );
}
