"use client";

import type { LocalDate } from "@espacios/domain";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DayStart } from "@/lib/bookings/month";
import { timeOf } from "@/lib/bookings/search";

/**
 * The chosen day's free starts (spec 0008): only starts where some room fits the search are offered, each with how many
 * rooms are free for it. From `lg` a card headed by the day, with arrows to the previous and next day with room; on a
 * phone the second step, three to a row.
 */
export function StartTimes({
  date,
  minutes,
  people,
  starts,
  available,
  selected,
  onSelect,
  onDay,
}: {
  readonly date: LocalDate;
  readonly minutes: number;
  readonly people: number;
  readonly starts: readonly DayStart[];
  /** Days with room, earliest first, for the arrows. */
  readonly available: readonly LocalDate[];
  readonly selected: number | null;
  readonly onSelect: (start: number) => void;
  readonly onDay: (date: LocalDate) => void;
}) {
  const t = useTranslations("booking.times");
  const format = useFormatter();
  const dayName = format.dateTime(new Date(`${date}T12:00:00Z`), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const rooms = new Set(starts.flatMap((item) => item.roomIds)).size;
  const previous = available.filter((day) => day < date).at(-1);
  const next = available.find((day) => day > date);

  return (
    <section
      aria-labelledby="times-step"
      className="lg:bg-card flex flex-col gap-3 lg:rounded-xl lg:border lg:p-5 lg:shadow-sm"
    >
      <div className="flex items-end justify-between gap-2 lg:hidden">
        <h2 id="times-step" className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          {t("step")}
        </h2>
        <span className="text-muted-foreground text-sm">{t("length", { minutes })}</span>
      </div>

      <div className="hidden items-center gap-3 border-b pb-3 lg:flex">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label={t("previousDay")}
            disabled={!previous}
            onClick={() => (previous ? onDay(previous) : null)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label={t("nextDay")}
            disabled={!next}
            onClick={() => (next ? onDay(next) : null)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold first-letter:uppercase">{dayName}</p>
          <p className="text-muted-foreground text-sm">{t("dayDescription", { count: rooms, people })}</p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {t("available", { count: rooms })}
        </Badge>
      </div>

      {starts.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground hidden text-sm lg:block">{t("suggested")}</p>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            aria-label={t("label", { day: dayName })}
            value={selected === null ? "" : String(selected)}
            onValueChange={(value) => (value ? onSelect(Number(value)) : null)}
            className="grid w-full grid-cols-3 lg:flex lg:flex-wrap"
          >
            {starts.map((item) => (
              <ToggleGroupItem
                key={item.start}
                value={String(item.start)}
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-16 flex-col gap-0 tabular-nums lg:h-11 lg:px-4"
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
