"use client";

import { useId, useState } from "react";

import {
  isBookableDay,
  type LocalDate,
  lastBookableDay,
  parseLocalDate,
  todayAt,
  zonedInstant,
} from "@espacios/domain";
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

export type DateFieldProps = {
  readonly value: string;
  readonly onChange: (date: string) => void;
  readonly now: Date;
  readonly invalid: boolean;
  readonly errorId: string;
};

/**
 * Fecha (spec 0003): a typed `dd/mm/aaaa` input plus a calendar popover, both writing one hidden `date` field in
 * `YYYY-MM-DD`, which is what the form posts. Text that cannot be read posts an empty `date`, so the server answers
 * `invalid_input` with Fecha marked. The calendar disables past days, weekends and days beyond 60 days with the domain
 * rule; the hint says why. Only display: the server checks the date again.
 */
export function DateField({ value, onChange, now, invalid, errorId }: DateFieldProps) {
  const t = useTranslations("bookingForm");
  const format = useFormatter();
  const [typed, setTyped] = useState(() => toTyped(value));
  const [open, setOpen] = useState(false);
  const formatHintId = useId();
  const ruleHintId = useId();

  const selected = parseLocalDate(value);
  const today = todayAt(now);
  const describedBy = [invalid ? errorId : null, formatHintId, ruleHintId].filter(Boolean).join(" ");
  // Noon in the facility's zone, so the long date names the right day whatever the browser's zone.
  const spoken = selected ? format.dateTime(zonedInstant(selected, 12 * 60), "long") : null;

  const pick = (cell: Date | undefined) => {
    const date = cell ? cellToLocalDate(cell) : null;
    if (!date) return;
    onChange(date);
    setTyped(toTyped(date));
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="booking-date">{t("date")}</Label>
      <div className="flex gap-2">
        <Input
          id="booking-date"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t("datePlaceholder")}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            onChange(fromTyped(event.target.value) ?? "");
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="max-w-40"
        />
        <input type="hidden" name="date" value={value} />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={spoken ? t("changeDateTo", { date: spoken }) : t("chooseDate")}
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
              defaultMonth={localDateToCell(selected ?? today)}
              startMonth={localDateToCell(today)}
              endMonth={localDateToCell(lastBookableDay(now))}
              disabled={(cell) => {
                const date = cellToLocalDate(cell);
                return !date || !isBookableDay(date, now);
              }}
              onSelect={pick}
            />
          </PopoverContent>
        </Popover>
      </div>
      <p id={formatHintId} className="sr-only">
        {t("dateFormat")}
      </p>
      <p id={ruleHintId} className="text-muted-foreground text-sm">
        {t("dateHint")}
      </p>
    </div>
  );
}
