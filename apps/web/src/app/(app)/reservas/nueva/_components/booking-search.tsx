"use client";

import { useMemo } from "react";

import type { FacilityMonth } from "@espacios/application";
import { formatTime, type LocalDate } from "@espacios/domain";
import { cn } from "cn";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import type { BookingChoice } from "@/components/booking/confirm-booking";
import { indexMonth, monthStarts, roomsOnDay } from "@/lib/bookings/month";
import { timeOf } from "@/lib/bookings/search";

import { BookingFilters } from "./booking-filters";
import { BookingSummary } from "./booking-summary";
import { DayPicker } from "./day-picker";
import { RoomChoices } from "./room-choices";
import { type Facility, SearchHeader } from "./search-header";
import { StartTimes } from "./start-times";
import { useSearch } from "./use-search";

/**
 * The booking search of spec 0008. The page hands over one sede's month; everything on screen is read from it here:
 * the days with room, the day's starts, every room over the day and its fit for the chosen window. On a phone it is
 * one guided column (day, what for, start, room) with the summary fixed at the bottom; from `lg`, the day and the
 * filters on the left and the starts, the rooms and the summary on the right.
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
  const chosen = rooms.find((item) => item.room.id === search.roomId);
  const choice: BookingChoice | null =
    chosen && window
      ? {
          room: {
            ...chosen.room,
            facility: {
              id: data.facility.id,
              name: data.facility.name,
              timeZone: data.facility.timeZone,
              opensAt: formatTime(data.facility.opensAt),
              closesAt: formatTime(data.facility.closesAt),
              openWeekdays: data.facility.openWeekdays,
            },
          },
          date: search.date,
          start: timeOf(window.start),
          end: timeOf(window.end),
        }
      : null;

  return (
    <div
      className={cn("flex flex-col gap-4 pb-56 transition-opacity lg:pb-0", pending && "opacity-60")}
      aria-busy={pending}
    >
      <SearchHeader facilities={facilities} facility={facility} onFacility={(facilityId) => go({ facilityId })} />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[22rem_1fr] lg:items-start">
        {/* On a phone these two sections come first, in order; from lg they are the left column. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <DayPicker
            date={search.date}
            month={search.month}
            available={available}
            facility={data.facility}
            now={now}
            onSelect={(date: LocalDate) => go({ date })}
            onMonth={(next: LocalDate) => go({ month: next })}
          />
          <BookingFilters search={search} go={go} />
          <p className="bg-card text-muted-foreground hidden items-start gap-2 rounded-xl border p-4 text-sm lg:flex">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("filters.rules")}
          </p>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <StartTimes
            date={search.date}
            minutes={search.minutes}
            people={search.people}
            starts={dayStarts}
            available={available}
            selected={search.start}
            onSelect={(start) => go({ start, roomId: null })}
            onDay={(date) => go({ date })}
          />
          <RoomChoices
            rooms={rooms}
            window={window}
            people={search.people}
            facility={data.facility}
            selectedId={search.roomId}
            onlyFree={search.onlyFree}
            onSelect={(roomId) => go({ roomId })}
          />
          <BookingSummary choice={choice} minutes={search.minutes} onBooked={() => go({ roomId: null })} />
        </div>
      </div>
    </div>
  );
}
