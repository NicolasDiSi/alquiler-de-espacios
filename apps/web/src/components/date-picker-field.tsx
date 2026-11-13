"use client";

import { type ReactNode, useId, useState } from "react";

import { type LocalDate, parseLocalDate, zonedInstant } from "@espacios/domain";
import { CalendarDays } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { es } from "react-day-picker/locale";

import { FieldErrorText } from "@/components/field-error-text";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Today in the month: the calendars' today ring and text (`--calendar-today`) instead of shadcn's `muted` fill, barely
 * apart from the popover.
 * The picked day keeps the primary fill (`data-selected-single`), so the two never look alike.
 */
const TODAY_CLASS =
  "rdp-today rounded-(--cell-radius) [&:not([data-selected=true])_button]:text-calendar-today [&:not([data-selected=true])_button]:font-semibold [&:not([data-selected=true])_button]:ring-2 [&:not([data-selected=true])_button]:ring-inset [&:not([data-selected=true])_button]:ring-calendar-today";

/**
 * A day already gone: muted text, still a button (a calendar can show the past) and never as faint as a day that
 * cannot be picked (`opacity-50`). The legend calls it "Ya pasó"; the hatch stays on the grid, where no text sits on it.
 */
const PAST_CLASS = "[&:not([data-selected=true])_button]:text-muted-foreground";

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

/**
 * The calendar popover alone (the APG date picker dialog's grid, one tab stop): a trigger button and a month to pick a
 * day from. `DatePickerField` puts it next to a typed input; a toolbar can use it on its own to jump to a day.
 */
export function DatePickerButton({
  selected,
  onPick,
  label,
  children,
  isDisabled,
  defaultMonth,
  startMonth,
  endMonth,
  today,
}: {
  readonly selected: LocalDate | null;
  readonly onPick: (date: LocalDate) => void;
  /** The trigger's accessible name. */
  readonly label: string;
  /** Visible text next to the icon; none for an icon only button. */
  readonly children?: ReactNode;
  readonly isDisabled?: (date: LocalDate) => boolean;
  readonly defaultMonth: LocalDate;
  readonly startMonth?: LocalDate | undefined;
  readonly endMonth?: LocalDate | undefined;
  /**
   * Today in the sede's zone. Without it DayPicker takes the browser's date, which after 21:00 in Buenos Aires is
   * already tomorrow in UTC; with it, today is ringed and the days before it read as past.
   */
  readonly today?: LocalDate | undefined;
}) {
  const [open, setOpen] = useState(false);

  const pick = (cell: Date | undefined) => {
    const date = cell ? cellToLocalDate(cell) : null;
    if (!date) return;
    onPick(date);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size={children ? "default" : "icon"} aria-label={label}>
          <CalendarDays aria-hidden />
          {children}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          classNames={{ today: TODAY_CLASS }}
          {...(today
            ? {
                today: localDateToCell(today),
                modifiers: { past: (cell: Date) => (cellToLocalDate(cell) ?? today) < today },
                modifiersClassNames: { past: PAST_CLASS },
              }
            : {})}
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
  );
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
  /** The refusal's reason, under the field, when it names this one (its `id` is in `mark`). */
  readonly error?: { readonly id: string; readonly message: string } | null;
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
  error,
}: DatePickerFieldProps) {
  const t = useTranslations("datePicker");
  const format = useFormatter();
  const [typed, setTyped] = useState(() => toTyped(value));
  const formatHintId = useId();
  const ruleHintId = useId();

  const selected = parseLocalDate(value);
  // The value can change from outside (a shortcut that fills the day): show it unless the text already reads as it.
  const shown = selected && fromTyped(typed) !== selected ? toTyped(selected) : typed;
  const describedBy = [mark?.["aria-describedby"], formatHintId, hint ? ruleHintId : null].filter(Boolean).join(" ");
  // Noon in the zone, so the long date names the right day whatever the browser's zone.
  const spoken = selected ? format.dateTime(zonedInstant(selected, 12 * 60, timeZone), "long") : null;

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
        <DatePickerButton
          selected={selected}
          onPick={(date) => {
            onChange(date);
            setTyped(toTyped(date));
          }}
          label={spoken ? t("changeTo", { date: spoken }) : t("choose")}
          {...(isDisabled ? { isDisabled } : {})}
          defaultMonth={defaultMonth}
          startMonth={startMonth}
          endMonth={endMonth}
        />
      </div>
      <p id={formatHintId} className="sr-only">
        {t("format")}
      </p>
      {hint ? (
        <p id={ruleHintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      <FieldErrorText error={error} />
    </div>
  );
}
