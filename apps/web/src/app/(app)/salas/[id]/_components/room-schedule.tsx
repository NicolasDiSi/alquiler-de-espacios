"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { FacilityMonth } from "@espacios/application";
import {
  addDays,
  BOOKING_RULES,
  busySpans,
  isOpenWeekday,
  type LocalDate,
  localMinutesOf,
  todayAt,
} from "@espacios/domain";
import { type CalendarApi, type EventInput, useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import esLocale from "@fullcalendar/react/locales/es";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { cn } from "cn";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { BookSlotDialog } from "@/components/booking/book-slot-dialog";
import { BookingLegend } from "@/components/calendar/booking-legend";
import {
  BUSY_LOOK,
  busyStateOf,
  DRAFT_LOOK,
  dayMarkOptions,
  UNAVAILABLE_LOOK,
} from "@/components/calendar/calendar-look";
import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { type CardData, EVENT_CARD_VIEW } from "@/components/calendar/event-card";
import { MyBookingDetails, type MyBookingShown } from "@/components/calendar/my-booking-details";
import { ROOM_CALENDAR_OPTIONS, roomTimeGrid } from "@/components/calendar/room-calendar-options";
import { useSlotHover } from "@/components/calendar/use-slot-hover";
import { DatePickerButton } from "@/components/date-picker-field";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useClock } from "@/hooks/use-clock";
import { useMounted } from "@/hooks/use-mounted";
import { indexMonth } from "@/lib/bookings/month";
import { bookableFrom, isFreeSlot, roomOptions, scrollTimeFor } from "@/lib/bookings/room-matrix";
import { SCHEDULE_VIEWS, type ScheduleView, timeOf } from "@/lib/bookings/search";
import { zoneOffset } from "@/lib/operator/format";

const plugins = [dayGridPlugin, timeGridPlugin, interactionPlugin];

/** The calendar's view for each `?vista`. */
const FC_VIEW = { mes: "dayGridMonth", semana: "timeGridWeek", dia: "timeGridDay" } as const satisfies Record<
  ScheduleView,
  string
>;
const viewOf = (type: string | undefined): ScheduleView =>
  SCHEDULE_VIEWS.find((view) => FC_VIEW[view] === type) ?? SCHEDULE_VIEWS[0];

/**
 * The calendar runs in UTC with the sede's wall clock written as if it were UTC ("floating" time), as the matrix of
 * `/salas` does: a day and its local minutes go in through `floating` and come back through `local`, nowhere else.
 */
const floating = (date: LocalDate, minutes: number) => `${date}T${timeOf(minutes)}:00Z`;
const local = (instant: Date) => ({
  date: instant.toISOString().slice(0, 10) as LocalDate,
  minutes: instant.getUTCHours() * 60 + instant.getUTCMinutes(),
});

type Draft = { readonly day: LocalDate; readonly start: number; readonly minutes: number };

/**
 * One room's bookings by month, week or day. Busy time reads "Ocupada", "Tu reserva" or "No disponible", never
 * whose; time that can no longer be booked is shaded. A range picked in the week or day view, or a day clicked in the
 * month view (its first free start), draws a card and opens the same booking dialog as `/salas`; closing the dialog
 * drops both. The server reads the six weeks around `?fecha`; moving past them asks it again, otherwise the date and
 * the view are only mirrored in the URL.
 */
export function RoomSchedule({
  roomId,
  month,
  initialDate,
  initialView,
  now: serverNow,
  className,
}: {
  readonly roomId: string;
  readonly month: FacilityMonth;
  readonly initialDate: LocalDate;
  readonly initialView: ScheduleView;
  readonly now: Date;
  /** The calendar's frame: the screen sets its height, the calendar scrolls inside it. */
  readonly className?: string;
}) {
  const t = useTranslations("rooms.detail.calendar");
  const matrix = useTranslations("rooms.matrix");
  const legend = useTranslations("booking.timeline.legend");
  const router = useRouter();
  const controller = useCalendarController();
  const mounted = useMounted();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  // The company's own booking a click opened; someone else's and a block open nothing.
  const [mine, setMine] = useState<MyBookingShown | null>(null);
  // The day the user asked for (the link's, "Ir a fecha" or "Hoy"): marked in primary; prev and next leave it.
  const [picked, setPicked] = useState<LocalDate>(initialDate);
  const calendar = useRef<CalendarApi | null>(null);
  // The sede's "now", advancing while the page stays open: the time line, the time already past and "Hoy" read it.
  const now = useClock(serverNow);
  const data = useMemo(() => indexMonth(month), [month]);
  const room = data.rooms.find((item) => item.id === roomId);
  const { facility } = data;
  const isMonth = controller.view?.type === FC_VIEW.mes;

  const events = useMemo(() => {
    const list: EventInput[] = [];
    const busy = data.busyByRoom.get(roomId) ?? [];
    for (let day = data.from; day <= data.to; day = addDays(day, 1)) {
      if (!isOpenWeekday(day, facility)) continue;
      for (const span of busySpans(day, facility, busy)) {
        const start = Math.max(span.start, facility.opensAt);
        const end = Math.min(span.end, facility.closesAt);
        if (start >= end) continue;
        const state = busyStateOf(span);
        list.push({
          id: `${day}-${start}-${state}`,
          title: legend(state),
          extendedProps: { card: { variant: state, label: legend(state) } satisfies CardData },
          start: floating(day, start),
          end: floating(day, end),
          ...BUSY_LOOK[state],
        });
      }
      // The part of today already gone, hatched inside its column. A whole day that takes nothing is drawn by its cell
      // (`dayMarkOptions`), not by an event.
      const from = bookableFrom(data, day, now);
      if (!isMonth && from > facility.opensAt && from < facility.closesAt) {
        list.push({
          id: `past-${day}`,
          start: floating(day, facility.opensAt),
          end: floating(day, from),
          ...UNAVAILABLE_LOOK,
        });
      }
    }
    if (draft) {
      list.push({
        id: "draft",
        title: matrix("draft"),
        extendedProps: { card: { variant: "draft", label: matrix("draft") } satisfies CardData },
        start: floating(draft.day, draft.start),
        end: floating(draft.day, draft.start + draft.minutes),
        ...DRAFT_LOOK,
      });
    }
    return list;
  }, [data, facility, roomId, now, isMonth, draft, legend, matrix]);

  /** A card for `minutes` from `start` on `day`, an hour when it fits, else the longest that does up to `wanted`. */
  const pick = (day: LocalDate, start: number, wanted: number) => {
    const { durations } = roomOptions(data, roomId, day, now, start);
    const minutes = durations.filter((length) => length <= Math.max(wanted, 60)).at(-1);
    if (minutes === undefined) {
      toast.info(t("noStarts"));
      return;
    }
    setDraft({ day, start, minutes });
  };

  const today = todayAt(now, facility.timeZone);
  const shown = controller.getDate();
  const shownDay = shown ? local(shown).date : null;
  const view = viewOf(controller.view?.type);
  const hiddenDays = [0, 1, 2, 3, 4, 5, 6].filter((weekday) => !facility.openWeekdays.includes(weekday));
  const hover = useSlotHover((start) => {
    const slot = local(start);
    return isFreeSlot(data, roomId, slot.date, now, slot.minutes);
  });

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "bg-card flex flex-col overflow-hidden rounded-xl border shadow-sm transition-opacity",
          pending && "opacity-60",
          className,
        )}
        aria-busy={pending}
      >
        <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-lg leading-none font-medium first-letter:uppercase" aria-live="polite">
              {controller.view?.title}
            </h2>
            <p className="text-muted-foreground text-sm">{t("hint")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ButtonGroup>
              <Button
                size="icon"
                variant="outline"
                className="size-11"
                aria-label={t("previous")}
                onClick={() => controller.prev()}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setPicked(today);
                  controller.gotoDate(today);
                  // After the calendar resets its scroll for the new date: land on the current time line.
                  requestAnimationFrame(() =>
                    calendar.current?.scrollToTime(scrollTimeFor(data, [roomId], today, now)),
                  );
                }}
              >
                {t("today")}
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-11"
                aria-label={t("next")}
                onClick={() => controller.next()}
              >
                <ChevronRight aria-hidden />
              </Button>
            </ButtonGroup>
            <DatePickerButton
              selected={picked}
              onPick={(date) => {
                setPicked(date);
                controller.gotoDate(date);
              }}
              label={t("goTo")}
              isDisabled={(date) => !isOpenWeekday(date, facility)}
              defaultMonth={shownDay ?? today}
              today={today}
            >
              {t("goTo")}
            </DatePickerButton>
            <Select value={view} onValueChange={(next) => controller.changeView(FC_VIEW[next as ScheduleView])}>
              <SelectTrigger className="h-11 data-[size=default]:h-11" aria-label={t("view")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {SCHEDULE_VIEWS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`views.${key}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <BookingLegend className="border-b px-4 py-2" />

        {mounted ? (
          <div className="relative min-h-0 flex-1" {...hover.handlers}>
            {hover.overlay}
            <EventCalendarViews
              {...ROOM_CALENDAR_OPTIONS}
              {...hover.options}
              views={{ timeGrid: { ...roomTimeGrid(zoneOffset(facility.timeZone, now)), ...EVENT_CARD_VIEW } }}
              eventClick={(info) => {
                const card = info.event.extendedProps.card as CardData | undefined;
                const { start, end } = info.event;
                if (card?.variant === "mine" && start && end && room) setMine({ room: room.name, start, end });
              }}
              controller={controller}
              {...dayMarkOptions(
                (date) => local(date).date === picked,
                (date) => bookableFrom(data, local(date).date, now) >= facility.closesAt,
              )}
              plugins={plugins}
              initialView={FC_VIEW[initialView]}
              initialDate={initialDate}
              locale={esLocale}
              timeZone="UTC"
              now={floating(today, localMinutesOf(now, facility.timeZone))}
              headerToolbar={false}
              popoverCloseContent={() => <XIcon className="text-muted-foreground group-hover:text-foreground size-5" />}
              events={events}
              datesSet={(info) => {
                calendar.current = info.view.calendar;
                const first = local(info.start).date;
                const last = addDays(local(info.end).date, -1);
                const params = new URLSearchParams({
                  fecha: local(info.view.currentStart).date,
                  vista: viewOf(info.view.type),
                });
                const href = `/salas/${roomId}?${params}`;
                // Past the weeks the server read: ask it for the ones around the new date.
                if (first < data.from || last > data.to) {
                  startTransition(() => router.replace(href, { scroll: false }));
                } else {
                  window.history.replaceState(null, "", href);
                }
              }}
              nowIndicator
              allDaySlot={false}
              hiddenDays={hiddenDays}
              slotMinTime={timeOf(facility.opensAt)}
              slotMaxTime={timeOf(facility.closesAt)}
              slotDuration="00:30:00"
              slotHeaderFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              dayMaxEvents={3}
              height="100%"
              // Open on the current time line today, else on the first slot the room can still take that day.
              scrollTime={scrollTimeFor(data, [roomId], shownDay ?? initialDate, now)}
              // The week and day views pick a range; a day of the month view is a click (its first free start).
              selectable={!isMonth}
              selectMirror
              unselectAuto={false}
              // Busy time cannot be picked; the hatched background is refused by `selectAllow` instead.
              selectOverlap={(event) => event.display === "background"}
              selectAllow={(span) => {
                const start = local(span.start);
                const end = local(new Date(span.end.getTime() - 1));
                const minutes = (span.end.getTime() - span.start.getTime()) / 60_000;
                return (
                  !span.allDay &&
                  start.date === end.date &&
                  start.minutes >= bookableFrom(data, start.date, now) &&
                  minutes <= BOOKING_RULES.maxMinutes
                );
              }}
              select={(info) => {
                info.view.calendar.unselect();
                const start = local(info.start);
                pick(start.date, start.minutes, (info.end.getTime() - info.start.getTime()) / 60_000);
              }}
              dateClick={(info) => {
                if (!info.allDay) return;
                const day = local(info.date).date;
                const first = roomOptions(data, roomId, day, now, 0).starts[0];
                if (first === undefined) {
                  toast.info(t("noStarts"));
                  return;
                }
                pick(day, first, 60);
              }}
            />
          </div>
        ) : (
          <Skeleton className="min-h-0 w-full flex-1 rounded-none" />
        )}
      </div>

      <MyBookingDetails shown={mine} onClose={() => setMine(null)} />

      {draft && room ? (
        <BookSlotDialog
          month={data}
          room={room}
          day={draft.day}
          now={now}
          draft={{ column: 0, start: draft.start, minutes: draft.minutes }}
          onChange={(next) => setDraft({ day: draft.day, start: next.start, minutes: next.minutes })}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </div>
  );
}
