"use client";

import { type LocalDate, parseLocalDate } from "@espacios/domain";
import { es } from "react-day-picker/locale";

import { Calendar } from "@/components/ui/calendar";

const pad = (value: number) => String(value).padStart(2, "0");
/** DayPicker works on local `Date`s; only their year, month and day matter. */
const toCell = (date: LocalDate) => {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const fromCell = (cell: Date) =>
  parseLocalDate(`${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`);

/**
 * The month always in view (the template's calendar panel, spec 0008): a dot under each day with room for the search,
 * every other day disabled, 44 pixel days for touch. Picking a day or moving the month is the caller's to apply.
 */
export function AvailabilityCalendar({
  month,
  selected,
  available,
  onSelect,
  onMonthChange,
  bounds,
}: {
  readonly month: LocalDate;
  readonly selected: LocalDate | null;
  /** Days with at least one start for the search. */
  readonly available: readonly LocalDate[];
  readonly onSelect: (date: LocalDate) => void;
  readonly onMonthChange: (month: LocalDate) => void;
  /** The first and last month the navigation reaches (the booking horizon), when the caller limits it. */
  readonly bounds?: { readonly first: LocalDate; readonly last: LocalDate };
}) {
  const open = new Set(available);
  return (
    <Calendar
      mode="single"
      locale={es}
      fixedWeeks
      month={toCell(month)}
      {...(bounds ? { startMonth: toCell(bounds.first), endMonth: toCell(bounds.last) } : {})}
      selected={selected ? toCell(selected) : undefined}
      onSelect={(cell) => {
        const date = cell ? fromCell(cell) : null;
        if (date) onSelect(date);
      }}
      onMonthChange={(cell) => {
        const date = fromCell(cell);
        if (date) onMonthChange(date);
      }}
      disabled={(cell) => {
        const date = fromCell(cell);
        return !date || !open.has(date);
      }}
      modifiers={{ available: available.map(toCell) }}
      modifiersClassNames={{
        available:
          "relative after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
      }}
      className="w-full p-0 [--cell-size:--spacing(11)]"
    />
  );
}
