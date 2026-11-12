"use client";

import { Suspense, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { FacilityMonth } from "@espacios/application";
import { addDays, type LocalDate, type Result, todayAt } from "@espacios/domain";
import { cn } from "cn";
import { Building2, ChevronLeft, ChevronRight, Minus, Plus, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { DatePickerButton } from "@/components/date-picker-field";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { mondayOf, PEOPLE_MAX, type RoomsSearch, roomsHref } from "@/lib/bookings/search";
import { zoneLabel } from "@/lib/operator/format";

import { RoomMatrix } from "./room-matrix";

type Facility = {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly openWeekdays: readonly number[];
};

const noon = (date: LocalDate) => new Date(`${date}T12:00:00Z`);

/** What paints while the week is read: the day pills and the matrix, at their final size. */
function MatrixSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-[40rem] w-full rounded-xl" />
    </div>
  );
}

/**
 * The rooms matrix of `/salas` (spec 0009): the filters (sede, week, go to a date, people) and, behind `<Suspense>`,
 * the week's data read with `use()`. A new sede or week goes to the server with `router.replace`; the day and the
 * people are applied here and only mirrored in the URL with the History API.
 */
export function RoomsWeek({
  initial,
  facilities,
  week,
  now,
}: {
  readonly initial: RoomsSearch;
  readonly facilities: readonly Facility[];
  readonly week: Promise<Result<FacilityMonth>>;
  readonly now: Date;
}) {
  const t = useTranslations("rooms.matrix");
  const format = useFormatter();
  const router = useRouter();
  const [search, setSearch] = useState(initial);
  const [pending, startTransition] = useTransition();
  const facility = facilities.find((item) => item.id === search.facilityId);
  const monday = mondayOf(search.date);
  const sunday = addDays(monday, 6);

  const go = (patch: Partial<RoomsSearch>) => {
    const next = { ...search, ...patch };
    const href = roomsHref(next);
    if (next.facilityId !== search.facilityId || mondayOf(next.date) !== monday) {
      startTransition(() => router.replace(href, { scroll: false }));
      return;
    }
    setSearch(next);
    window.history.replaceState(null, "", href);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">
            {facility
              ? t("description", {
                  opens: facility.opensAt,
                  closes: facility.closesAt,
                  zone: zoneLabel(facility.timeZone),
                })
              : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={search.facilityId} onValueChange={(facilityId) => go({ facilityId })}>
            <SelectTrigger className="h-11 w-full data-[size=default]:h-11 sm:w-64" aria-label={t("facility")}>
              <Building2 aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {facilities.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <ButtonGroup>
            <Button
              size="icon"
              variant="outline"
              className="size-11"
              aria-label={t("previousWeek")}
              onClick={() => go({ date: addDays(search.date, -7) })}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <span
              aria-live="polite"
              className="bg-background flex h-11 items-center border-y px-3 text-sm font-medium tabular-nums"
            >
              {t("week", {
                from: format.dateTime(noon(monday), { day: "numeric", timeZone: "UTC" }),
                to: format.dateTime(noon(sunday), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
              })}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="size-11"
              aria-label={t("nextWeek")}
              onClick={() => go({ date: addDays(search.date, 7) })}
            >
              <ChevronRight aria-hidden />
            </Button>
          </ButtonGroup>

          <Button
            variant="secondary"
            className="h-11"
            onClick={() => go({ date: todayAt(now, facility?.timeZone ?? "UTC") })}
          >
            {t("today")}
          </Button>

          <DatePickerButton
            selected={search.date}
            onPick={(date) => go({ date })}
            label={t("goTo")}
            defaultMonth={search.date}
          >
            {t("goTo")}
          </DatePickerButton>

          <fieldset
            aria-label={t("people")}
            className="m-0 flex h-11 items-center gap-1 rounded-md border px-2 sm:ms-auto"
          >
            <Users aria-hidden className="text-muted-foreground size-4" />
            <span className="text-muted-foreground px-1 text-sm">{t("people")}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={t("fewer")}
              disabled={search.people <= 1}
              onClick={() => go({ people: search.people - 1 })}
            >
              <Minus aria-hidden />
            </Button>
            <output aria-live="polite" className="min-w-6 text-center font-semibold tabular-nums">
              {search.people}
            </output>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={t("more")}
              disabled={search.people >= PEOPLE_MAX}
              onClick={() => go({ people: search.people + 1 })}
            >
              <Plus aria-hidden />
            </Button>
          </fieldset>
        </div>
      </div>

      <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        <Suspense fallback={<MatrixSkeleton />}>
          <RoomMatrix
            week={week}
            monday={monday}
            day={search.date}
            people={search.people}
            now={now}
            onDay={(date) => go({ date })}
          />
        </Suspense>
      </div>
    </div>
  );
}
