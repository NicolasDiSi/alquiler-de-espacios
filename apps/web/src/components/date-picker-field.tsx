"use client";

import { useId, useState } from "react";

import { type LocalDate, parseLocalDate, zonedInstant } from "@espacios/domain";
import { CalendarDays } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { es } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const pad = (value: number) => String(value).padStart(2, "0");

/** The day a calendar cell stands for. DayPicker works on local `Date`s; only their year, month and day matter. */
function cellToLocalDate(cell: Date): LocalDate | null {
  return parseLocalDate(`${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`);
}

function localDateToCell(date: LocalDate): Date {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** `YYYY-MM-DD` to the `dd/mm/aaaa` the user types. */
function toTyped(date: string): string {
  const parsed = parseLocalDate(date);
  return parsed ? parsed.split("-").reverse().join("/") : "";
}

const TYPED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** `dd/mm/aaaa` (or `d/m/aaaa`) to a real day, or `null`. */
function fromTyped(text: string): LocalDate | null {
  const match = TYPED.exec(text.trim());
  if (!match) return null;
  return parseLocalDate(`${match[3]}-${pad(Number(match[2]))}-${pad(Number(match[1]))}`);
}

export type DatePickerFieldProps = {
  /** The typed input's id (the label points at it). */
  readonly id: string;
  /** What the form posts: one hidden field in `YYYY-MM-DD`, empty when the typed text is not a day. */
  readonly name: string;
  readonly label: string;
  /** The rule in words ("hasta 60 días adelante"), shown under the field and read with it. */
  readonly hint?: string;
  readonly value: string;
  readonly onChange: (date: string) => void;
  /** The zone the chosen day is spoken in, so the trigger names the right day whatever the browser's zone. */
  readonly timeZone: string;
  /** Days the calendar offers but disables (with the reason in `hint`). The server checks the day again. */
  readonly isDisabled?: (date: LocalDate) => boolean;
  /** The month shown when nothing is chosen yet, and the range the calendar moves in. */
  readonly defaultMonth: LocalDate;
  readonly startMonth?: LocalDate;
  readonly endMonth?: LocalDate;
  /** `aria-invalid` and the alert's id when a refusal named this field. */
  readonly mark?: { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string };
};

/**
 * A date as the APG date picker dialog asks (the `calendar` skill): a typed `dd/mm/aaaa` input that stays available,
 * plus a calendar popover with one tab stop, both writing one hidden `YYYY-MM-DD` field. Presentation only: which days
 * are allowed is the caller's rule, passed in, and the server checks it again.
 */
export function DatePickerField({
  id,
  name,
  label,
  hint,
  value,
  onChange,
  timeZone,
  isDisabled,
  defaultMonth,
  startMonth,
  endMonth,
  mark,
}: DatePickerFieldProps) {
  const t = useTranslations("datePicker");
  const format = useFormatter();
  const [typed, setTyped] = useState(() => toTyped(value));
  const [open, setOpen] = useState(false);
  const formatHintId = useId();
  const ruleHintId = useId();

  const selected = parseLocalDate(value);
  // The value can change from outside (a shortcut that fills the day): show it unless the text already reads as it.
  const shown = selected && fromTyped(typed) !== selected ? toTyped(selected) : typed;
  const describedBy = [mark?.["aria-describedby"], formatHintId, hint ? ruleHintId : null].filter(Boolean).join(" ");
  // Noon in the zone, so the long date names the right day whatever the browser's zone.
  const spoken = selected ? format.dateTime(zonedInstant(selected, 12 * 60, timeZone), "long") : null;

  const pick = (cell: Date | undefined) => {
    const date = cell ? cellToLocalDate(cell) : null;
    if (!date) return;
    onChange(date);
    setTyped(toTyped(date));
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder={t("placeholder")}
          value={shown}
          onChange={(event) => {
            setTyped(event.target.value);
            onChange(fromTyped(event.target.value) ?? "");
          }}
          aria-invalid={mark?.["aria-invalid"]}
          aria-describedby={describedBy}
          className="max-w-40"
        />
        <input type="hidden" name={name} value={value} />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={spoken ? t("changeTo", { date: spoken }) : t("choose")}
            >
              <CalendarDays aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={es}
              autoFocus
              selected={selected ? localDateToCell(selected) : undefined}
              defaultMonth={localDateToCell(selected ?? defaultMonth)}
              {...(startMonth ? { startMonth: localDateToCell(startMonth) } : {})}
              {...(endMonth ? { endMonth: localDateToCell(endMonth) } : {})}
              disabled={(cell) => {
                const date = cellToLocalDate(cell);
                return !date || (isDisabled?.(date) ?? false);
              }}
              onSelect={pick}
            />
          </PopoverContent>
        </Popover>
      </div>
      <p id={formatHintId} className="sr-only">
        {t("format")}
      </p>
      {hint ? (
        <p id={ruleHintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
