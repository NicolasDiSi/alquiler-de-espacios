"use client";

import { useState } from "react";

import type { OperatorFacilityView, OperatorRoomView } from "@espacios/application";
import { parseLocalDate, todayAt } from "@espacios/domain";
import { useTranslations } from "next-intl";

import { DatePickerField } from "@/components/date-picker-field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DAY_MARKS } from "@/lib/operator/format";

import { Field } from "./field";
import { useFieldMark } from "./form-dialog";

/** Days as `YYYY-MM-DD` and times as `HH:MM` on the 30 minute marks, in the sede's zone. */
export type BlockTimes = { startDate: string; startTime: string; endDate: string; endTime: string };

/** "Todo el día" fills the sede's opening hours for the start day; the server checks the instants again. */
export function BlockFields({
  facility,
  rooms,
  initial,
}: {
  readonly facility: OperatorFacilityView;
  readonly rooms: readonly OperatorRoomView[];
  /** Days and times to start from (a calendar selection), read in the sede's zone. */
  readonly initial?: Partial<BlockTimes>;
}) {
  const t = useTranslations("operator.block.form");
  const [times, setTimes] = useState<BlockTimes>({
    startDate: "",
    startTime: facility.opensAt,
    endDate: "",
    endTime: facility.closesAt,
    ...initial,
  });
  const set = (field: keyof typeof times) => (event: { target: { value: string } }) =>
    setTimes((current) => ({ ...current, [field]: event.target.value }));
  const setDate = (field: "startDate" | "endDate") => (date: string) =>
    setTimes((current) => ({ ...current, [field]: date }));
  // Mounted only while the dialog is open, in the browser: today in the sede's zone, for display only.
  const [today] = useState(() => todayAt(new Date(), facility.timeZone));
  const marks = {
    roomId: useFieldMark("roomId"),
    startDate: useFieldMark("startDate"),
    startTime: useFieldMark("startTime"),
    endDate: useFieldMark("endDate"),
    endTime: useFieldMark("endTime"),
    reason: useFieldMark("reason"),
  };

  return (
    <div className="flex flex-col gap-4">
      <Field id="block-roomId" label={t("scope")}>
        <NativeSelect id="block-roomId" name="roomId" defaultValue="" {...marks.roomId}>
          <option value="">{t("wholeFacility")}</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <DatePickerField
          id="block-startDate"
          name="startDate"
          label={t("startDate")}
          value={times.startDate}
          onChange={setDate("startDate")}
          timeZone={facility.timeZone}
          isDisabled={(date) => date < today}
          defaultMonth={today}
          startMonth={today}
          mark={marks.startDate}
        />
        <Field id="block-startTime" label={t("startTime")}>
          <NativeSelect
            id="block-startTime"
            name="startTime"
            value={times.startTime}
            onChange={set("startTime")}
            {...marks.startTime}
          >
            {DAY_MARKS.slice(0, -1).map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <DatePickerField
          id="block-endDate"
          name="endDate"
          label={t("endDate")}
          value={times.endDate}
          onChange={setDate("endDate")}
          timeZone={facility.timeZone}
          isDisabled={(date) => date < (times.startDate || today)}
          defaultMonth={parseLocalDate(times.startDate) ?? today}
          startMonth={today}
          mark={marks.endDate}
        />
        <Field id="block-endTime" label={t("endTime")}>
          <NativeSelect
            id="block-endTime"
            name="endTime"
            value={times.endTime}
            onChange={set("endTime")}
            {...marks.endTime}
          >
            {DAY_MARKS.slice(1).map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!times.startDate}
          onClick={() =>
            setTimes((current) => ({
              startDate: current.startDate,
              startTime: facility.opensAt,
              endDate: current.startDate,
              endTime: facility.closesAt,
            }))
          }
        >
          {t("allDay")}
        </Button>
      </div>
      <Field id="block-reason" label={t("reason")} hint={t("reasonHint")}>
        <Input id="block-reason" name="reason" maxLength={200} required {...marks.reason} />
      </Field>
    </div>
  );
}
