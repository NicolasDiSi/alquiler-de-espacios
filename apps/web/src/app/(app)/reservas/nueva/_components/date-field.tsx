"use client";

import { type FacilityRules, isBookableDay, lastBookableDay, todayAt } from "@espacios/domain";
import { useTranslations } from "next-intl";

import { DatePickerField } from "@/components/date-picker-field";

export type DateFieldProps = {
  readonly value: string;
  readonly onChange: (date: string) => void;
  readonly now: Date;
  /** The facility of the chosen room (spec 0004): its zone and open days decide what the calendar enables. */
  readonly facility: FacilityRules;
  readonly invalid: boolean;
  readonly errorId: string;
};

/**
 * Fecha (spec 0003): the shared date picker with the booking rule. It disables past days, closed days and days beyond
 * the horizon with the domain rule (`isBookableDay`); the hint says why. Only display: the server checks again.
 */
export function DateField({ value, onChange, now, facility, invalid, errorId }: DateFieldProps) {
  const t = useTranslations("bookingForm");
  const { timeZone } = facility;
  // The usual hint names the days; a facility with other open days gets a hint that does not.
  const isMondayToFriday = [...facility.openWeekdays].sort().join() === "1,2,3,4,5";
  const today = todayAt(now, timeZone);

  return (
    <DatePickerField
      id="booking-date"
      name="date"
      label={t("date")}
      hint={isMondayToFriday ? t("dateHint") : t("dateHintOtherDays")}
      value={value}
      onChange={onChange}
      timeZone={timeZone}
      isDisabled={(date) => !isBookableDay(date, now, facility)}
      defaultMonth={today}
      startMonth={today}
      endMonth={lastBookableDay(now, timeZone)}
      mark={invalid ? { "aria-invalid": true, "aria-describedby": errorId } : undefined}
    />
  );
}
