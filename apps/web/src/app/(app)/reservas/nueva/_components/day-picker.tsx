"use client";

import { addDays, type FacilityRules, type LocalDate, lastBookableDay, todayAt, weekdayOf } from "@espacios/domain";
import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { AvailabilityCalendar } from "@/components/booking/availability-calendar";
import { Button } from "@/components/ui/button";
import { monthOf } from "@/lib/bookings/search";

const noon = (date: LocalDate) => new Date(`${date}T12:00:00Z`);
const mondayOf = (date: LocalDate) => addDays(date, -((weekdayOf(date) + 6) % 7));

/** The week of `date` on a phone: seven days, a dot under each day with room, the arrows move a week. */
function WeekStrip({
  date,
  available,
  first,
  last,
  onSelect,
}: {
  readonly date: LocalDate;
  readonly available: ReadonlySet<LocalDate>;
  /** The first and last day a booking can start on. */
  readonly first: LocalDate;
  readonly last: LocalDate;
  readonly onSelect: (date: LocalDate) => void;
}) {
  const t = useTranslations("booking.calendar");
  const format = useFormatter();
  const monday = mondayOf(date);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  // A week away lands on its first day with room, or its Monday when none is known (the month it is in is read then).
  const move = (weeks: number) => {
    const start = addDays(monday, weeks * 7);
    const week = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    onSelect(week.find((day) => available.has(day)) ?? (start < first ? first : start));
  };

  return (
    <div className="flex flex-col gap-3 lg:hidden">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold first-letter:uppercase">
          {format.dateTime(noon(date), { month: "long", year: "numeric", timeZone: "UTC" })}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label={t("previousWeek")}
            disabled={monday <= first}
            onClick={() => move(-1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label={t("nextWeek")}
            disabled={addDays(monday, 7) > last}
            onClick={() => move(1)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
      <ul className="grid grid-cols-7 gap-1.5" aria-label={t("week")}>
        {days.map((day) => {
          const open = available.has(day);
          const selected = day === date;
          const name = format.dateTime(noon(day), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
          return (
            <li key={day}>
              <button
                type="button"
                disabled={!open}
                aria-pressed={selected}
                aria-label={open ? t("dayAvailable", { day: name }) : t("dayUnavailable", { day: name })}
                onClick={() => onSelect(day)}
                className={cn(
                  "bg-card flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-lg border text-sm transition-colors",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] disabled:opacity-40",
                  selected && "border-primary bg-primary text-primary-foreground ring-primary/30 ring-2",
                )}
              >
                <span className={cn("text-xs uppercase", !selected && "text-muted-foreground")}>
                  {format.dateTime(noon(day), { weekday: "short", timeZone: "UTC" }).slice(0, 2)}
                </span>
                <span className="font-semibold tabular-nums">{day.slice(8)}</span>
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full bg-transparent",
                    open && "bg-primary",
                    open && selected && "bg-primary-foreground",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The day (spec 0008): the month always in view from `lg`, the week on a phone. Only days with room for the search are
 * enabled; moving to another month is the one move that reads new data. "Hoy" sits in the group's header.
 */
export function DayPicker({
  date,
  month,
  available,
  facility,
  now,
  onSelect,
  onMonth,
}: {
  readonly date: LocalDate;
  readonly month: LocalDate;
  /** Days of the data with at least one start for the search. */
  readonly available: readonly LocalDate[];
  readonly facility: FacilityRules;
  readonly now: Date;
  readonly onSelect: (date: LocalDate) => void;
  readonly onMonth: (month: LocalDate) => void;
}) {
  const t = useTranslations("booking.calendar");
  const first = todayAt(now, facility.timeZone);
  const last = lastBookableDay(now, facility.timeZone);
  const inMonth = available.filter((day) => monthOf(day) === month);

  return (
    <>
      <WeekStrip date={date} available={new Set(available)} first={first} last={last} onSelect={onSelect} />

      <div className="hidden flex-col gap-3 lg:flex">
        <AvailabilityCalendar
          month={month}
          selected={date}
          available={inMonth}
          onSelect={onSelect}
          onMonthChange={onMonth}
          bounds={{ first: monthOf(first), last: monthOf(last) }}
        />
        <ul className="text-muted-foreground flex justify-between border-t pt-3 text-xs">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="bg-primary size-1.5 rounded-full" />
            {t("legendAvailable")}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="bg-muted-foreground/40 size-1.5 rounded-full" />
            {t("legendUnavailable")}
          </li>
        </ul>
      </div>
    </>
  );
}
