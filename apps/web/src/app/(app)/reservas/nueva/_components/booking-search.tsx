"use client";

import { useMemo } from "react";

import type { FacilityMonth } from "@espacios/application";
import { type LocalDate, nextOpenDay } from "@espacios/domain";
import { cn } from "cn";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import type { BookingChoice } from "@/components/booking/confirm-booking";
import { Button } from "@/components/ui/button";
import { FieldSeparator } from "@/components/ui/field";
import { useIsMobile } from "@/hooks/use-mobile";
import { choiceRoom, indexMonth, monthStarts, roomsOnDay } from "@/lib/bookings/month";
import { timeOf } from "@/lib/bookings/search";

import { DurationField, OnlyFreeSwitch, PeopleField } from "./booking-filters";
import { BookingSummary } from "./booking-summary";
import { DayPicker } from "./day-picker";
import { FiltersSheet } from "./filters-sheet";
import { RoomChoices } from "./room-choices";
import { SearchGroup } from "./search-group";
import { type Facility, FacilitySelect, SearchHeader } from "./search-header";
import { StartTimes } from "./start-times";
import { useSearch } from "./use-search";

/**
 * The booking search of spec 0008. The page hands over one sede's month; everything on screen is read from it here:
 * the days with room, the day's starts, every room over the day and its fit for the chosen window. The choices are
 * grouped in three columns from `2xl`: the sede with the day, the meeting (people and length) with the start, and the
 * booking's head with every room (in a list that scrolls). Between `lg` and `2xl` the first two share the left column.
 * On a phone the filters (sede, people, length, "solo libres") move to a sheet; the day, the start and the rooms stay
 * on the page, with the summary fixed at the bottom.
 */
export function BookingSearchView({
  initial,
  facilities,
  month,
  now,
}: {
  readonly initial: Parameters<typeof useSearch>[0];
  readonly facilities: readonly Facility[];
  readonly month: FacilityMonth;
  readonly now: Date;
}) {
  const t = useTranslations("booking");
  const { search, go, pending } = useSearch(initial);
  const data = useMemo(() => indexMonth(month), [month]);
  // Every start of six weeks for every room: the one derivation worth keeping between renders (React's guidance: a
  // loop over thousands of slots whose inputs change only with the duration or the people).
  const starts = useMemo(
    () => monthStarts(data, search.minutes, search.people, now),
    [data, search.minutes, search.people, now],
  );
  const window = search.start === null ? null : { start: search.start, end: search.start + search.minutes };
  const rooms = roomsOnDay(data, search.date, search.people, now, window);
  const dayStarts = starts.get(search.date) ?? [];
  const available = [...starts].filter(([, list]) => list.length > 0).map(([date]) => date);
  const facility = facilities.find((item) => item.id === search.facilityId);
  // Read once here: on a phone the sede, the people, the length and "solo libres" move to the filters sheet, and each
  // control is drawn in one place only.
  const isMobile = useIsMobile();
  const chosen = rooms.find((item) => item.room.id === search.roomId);
  const choice: BookingChoice | null =
    chosen && window
      ? {
          room: choiceRoom(data, chosen.room),
          date: search.date,
          start: timeOf(window.start),
          end: timeOf(window.end),
        }
      : null;

  const today = (
    <Button variant="secondary" size="sm" className="h-9" onClick={() => go({ date: nextOpenDay(now, data.facility) })}>
      {t("calendar.today")}
    </Button>
  );

  return (
    <div
      className={cn("flex flex-col gap-4 pb-56 transition-opacity lg:pb-0", pending && "opacity-60")}
      aria-busy={pending}
    >
      <SearchHeader />
      {isMobile ? <FiltersSheet facilities={facilities} facility={facility} search={search} go={go} /> : null}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start 2xl:grid-cols-[22rem_22rem_minmax(0,1fr)]">
        {/* Between lg and 2xl the two groups share the left column; from 2xl each is a column of its own. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4 2xl:contents">
          <SearchGroup id="place-step" mark="1" title={t(isMobile ? "groups.day" : "groups.place")} action={today}>
            {isMobile ? null : (
              <FacilitySelect
                facilities={facilities}
                facility={facility}
                onFacility={(facilityId) => go({ facilityId })}
              />
            )}
            <DayPicker
              date={search.date}
              month={search.month}
              available={available}
              facility={data.facility}
              now={now}
              onSelect={(date: LocalDate) => go({ date })}
              onMonth={(next: LocalDate) => go({ month: next })}
            />
            <p className="text-muted-foreground hidden items-start gap-2 border-t pt-3 text-xs lg:flex">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t("filters.rules")}
            </p>
          </SearchGroup>

          <SearchGroup id="meeting-step" mark="2" title={t(isMobile ? "groups.time" : "groups.meeting")}>
            {isMobile ? null : (
              <>
                <PeopleField search={search} go={go} />
                <FieldSeparator />
                <DurationField search={search} go={go} />
                <FieldSeparator />
              </>
            )}
            <StartTimes
              date={search.date}
              minutes={search.minutes}
              starts={dayStarts}
              selected={search.start}
              onSelect={(start) => go({ start, roomId: null })}
            />
            {isMobile ? null : <OnlyFreeSwitch search={search} go={go} />}
          </SearchGroup>
        </div>

        {/* The booking's head (the summary with the button that books) above every room, in a list that scrolls. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <BookingSummary choice={choice} minutes={search.minutes} onBooked={() => go({ roomId: null })} />
          <RoomChoices
            rooms={rooms}
            window={window}
            people={search.people}
            facility={data.facility}
            selectedId={search.roomId}
            onlyFree={search.onlyFree}
            onSelect={(roomId) => go({ roomId })}
          />
        </div>
      </div>
    </div>
  );
}
