"use client";

import type { LocalDate } from "@espacios/domain";
import { Clock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DayStart } from "@/lib/bookings/month";
import { timeOf } from "@/lib/bookings/search";

/**
 * The chosen day's free starts (spec 0008): only starts where some room fits the search are offered. Part of the "Fecha
 * y hora" group, under the day; once a start is chosen, the header says when the booking ends.
 */
export function StartTimes({
  date,
  minutes,
  starts,
  selected,
  onSelect,
}: {
  readonly date: LocalDate;
  readonly minutes: number;
  readonly starts: readonly DayStart[];
  readonly selected: number | null;
  readonly onSelect: (start: number) => void;
}) {
  const t = useTranslations("booking.times");
  const groups = useTranslations("booking.groups");
  const format = useFormatter();
  const dayName = format.dateTime(new Date(`${date}T12:00:00Z`), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section aria-labelledby="times-step" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="times-step" className="text-sm font-medium">
          {t("suggested")}
        </h3>
        <span className="text-muted-foreground text-sm tabular-nums">
          {selected === null ? t("length", { minutes }) : groups("ends", { time: timeOf(selected + minutes) })}
        </span>
      </div>
      {starts.length > 0 ? (
        <div className="flex flex-col gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            aria-label={t("label", { day: dayName })}
            value={selected === null ? "" : String(selected)}
            onValueChange={(value) => (value ? onSelect(Number(value)) : null)}
            className="grid w-full grid-cols-3 lg:grid-cols-4"
          >
            {starts.map((item) => (
              <ToggleGroupItem
                key={item.start}
                value={String(item.start)}
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-16 flex-col gap-0 tabular-nums lg:h-11"
              >
                <span className="font-semibold">{timeOf(item.start)}</span>
                <span className="text-xs opacity-80 lg:sr-only">{t("rooms", { count: item.roomIds.length })}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : (
        <Empty className="border p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
