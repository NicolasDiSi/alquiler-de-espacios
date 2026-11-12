"use client";

import { type ReactElement, useState } from "react";

import type { OperatorBlockTarget } from "@espacios/application";
import { localDateOf, localMinutesOf } from "@espacios/domain";
import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/native-select";
import { markOfMinutes, zoneLabel } from "@/lib/operator/format";

import { createBlockAction } from "../../_actions/blocks";
import { BlockFields, type BlockTimes } from "../block-fields";
import { Field } from "../field";
import { FormDialog } from "../form-dialog";

/** A picked range as the block form's days and times, read in the sede's own zone. */
function timesOf(selection: { readonly start: Date; readonly end: Date }, timeZone: string): BlockTimes {
  return {
    startDate: localDateOf(selection.start, timeZone),
    startTime: markOfMinutes(localMinutesOf(selection.start, timeZone)),
    endDate: localDateOf(selection.end, timeZone),
    endTime: markOfMinutes(localMinutesOf(selection.end, timeZone)),
  };
}

/**
 * "Bloquear horario" from a client's or a sede's activity (spec 0007): the operator never books for a client (spec
 * 0004), but may close a room or a sede. The sede is picked first, then the spec 0005 block fields, prefilled when a calendar range was
 * selected. Opened by its trigger, or from outside with `open`.
 */
export function BlockSlotDialog({
  targets,
  trigger,
  open,
  onOpenChange,
  selection,
}: {
  readonly targets: readonly OperatorBlockTarget[];
  readonly trigger?: ReactElement;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly selection?: { readonly start: Date; readonly end: Date } | null;
}) {
  const t = useTranslations("operator.block.form");
  const [facilityId, setFacilityId] = useState(targets[0]?.facility.id ?? "");
  const target = targets.find((item) => item.facility.id === facilityId) ?? targets[0];
  if (!target) return null;
  const { facility } = target;

  return (
    <FormDialog
      action={createBlockAction}
      {...(trigger ? { trigger } : {})}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
      title={t("title")}
      description={t("description", { zone: zoneLabel(facility.timeZone) })}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
      timeZone={facility.timeZone}
      hidden={{ facilityId: facility.id }}
    >
      <div className="flex flex-col gap-4">
        <Field id="client-block-facility" label={t("facility")}>
          <NativeSelect
            id="client-block-facility"
            value={facility.id}
            onChange={(event) => setFacilityId(event.target.value)}
          >
            {targets.map((item) => (
              <option key={item.facility.id} value={item.facility.id}>
                {item.facility.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {/* A new sede starts its fields again: its hours and zone differ. */}
        <BlockFields
          key={facility.id}
          facility={facility}
          rooms={target.rooms}
          {...(selection ? { initial: timesOf(selection, facility.timeZone) } : {})}
        />
      </div>
    </FormDialog>
  );
}
