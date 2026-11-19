"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import type { FacilityMonth } from "@espacios/application";
import {
  addDays,
  BOOKING_RULES,
  isOpenWeekday,
  type LocalDate,
  localMinutesOf,
  type Result,
  todayAt,
} from "@espacios/domain";
import type { CalendarApi, EventInput } from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/react/interaction";
import esLocale from "@fullcalendar/react/locales/es";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { cn } from "cn";
import { ChevronLeft, ChevronRight, DoorOpen, Users, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { BookSlotDialog, type Draft } from "@/components/booking/book-slot-dialog";
import { BookingLegend } from "@/components/calendar/booking-legend";
import {
  BUSY_LOOK,
  busyStateOf,
  closedLaneOptions,
  DRAFT_LOOK,
  UNAVAILABLE_LOOK,
} from "@/components/calendar/calendar-look";
import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { type CardData, EVENT_CARD_VIEW } from "@/components/calendar/event-card";
import { MyBookingDetails, type MyBookingShown } from "@/components/calendar/my-booking-details";
import { ROOM_CALENDAR_OPTIONS, roomTimeGrid } from "@/components/calendar/room-calendar-options";
import { useSlotHover } from "@/components/calendar/use-slot-hover";
import { DatePickerButton } from "@/components/date-picker-field";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useClock } from "@/hooks/use-clock";
import { useMounted } from "@/hooks/use-mounted";
import { indexMonth } from "@/lib/bookings/month";
import {
  bookableFrom,
  cellOf,
  columnDate,
  columnTime,
  freeSlotCount,
  freeSlotsByDay,
  isFreeSlot,
  matrixBusy,
  matrixRooms,
  roomOptions,
  scrollTimeFor,
} from "@/lib/bookings/room-matrix";
import { matchesName, mondayOf, type RoomSize, type RoomsView, timeOf } from "@/lib/bookings/search";
import { zoneOffset } from "@/lib/operator/format";

import { RoomCards } from "./room-cards";

const plugins = [timeGridPlugin, interactionPlugin];
const noon = (date: LocalDate) => new Date(`${date}T12:00:00Z`);

/**
 * The week's rooms (spec 0009), in one card headed as the room detail's calendar: the day as title, how to book, week
 * and today controls and "Ir a fecha" (a success frame around each day of the month with a free slot); then a strip of
 * day pills over the month's six weeks (the days the sede opens enabled, each with its free slots for the rooms the
 * filters leave), a week in view on a wide screen, scrolled by touch or a week at a time by the arrows, which mark the
 * week's first open day without choosing it (a tap on a pill chooses; none of it asks the server); then the legend and the chosen day as a time grid
 * with a column per room (its header opens the room) or as cards. Busy time reads "Ocupada", "Tu reserva" or
 * "No disponible", never whose. Picking a free range in one column draws a card for it and opens the
 * booking dialog; closing the dialog drops both.
 */
export function RoomMatrix({
  week,
  day,
  people,
  size,
  query,
  view,
  now: serverNow,
  onDay,
  className,
}: {
  readonly week: Promise<Result<FacilityMonth>>;
  readonly day: LocalDate;
  readonly people: number;
  readonly size: RoomSize;
  /** The room name search. */
  readonly query: string;
  readonly view: RoomsView;
  readonly now: Date;
  readonly onDay: (date: LocalDate) => void;
  /** The calendar's frame: the screen sets its height, the calendar scrolls inside it. */
  readonly className?: string;
}) {
  const t = useTranslations("rooms.matrix");
  const legend = useTranslations("booking.timeline.legend");
  const dayLegend = useTranslations("booking.calendar");
  const format = useFormatter();
  const mounted = useMounted();
  const result = use(week);
  const data = useMemo(() => (result.ok ? indexMonth(result.value) : null), [result]);
  const [draft, setDraft] = useState<Draft | null>(null);
  // The company's own booking a click opened; someone else's and a block open nothing.
  const [mine, setMine] = useState<MyBookingShown | null>(null);
  const strip = useRef<HTMLUListElement>(null);
  const calendar = useRef<CalendarApi | null>(null);
  // The sede's "now", advancing while the page stays open: the time line, the time already past and "Hoy" read it.
  const now = useClock(serverNow);
  const rooms = data ? matrixRooms(data, people, size).filter((room) => matchesName(room.name, query)) : [];
  const zone = data?.facility.timeZone ?? "UTC";
  const today = todayAt(now, zone);
  const nowOnGrid =
    data && day === today
      ? { minutes: localMinutesOf(now, zone), opensAt: data.facility.opensAt, closesAt: data.facility.closesAt }
      : null;
  const hover = useSlotHover((start) => {
    const cell = cellOf(start);
    const room = rooms[cell.column];
    return Boolean(data && room && isFreeSlot(data, room.id, day, now, cell.minutes));
  }, nowOnGrid);

  // The pill the strip's arrows point at, bordered but not chosen: the arrows only scroll, choosing is a tap on a pill.
  // A new chosen day moves the mark back onto it.
  const [ring, setRing] = useState({ day, at: day });
  const cursor = ring.day === day ? ring.at : day;
  // The first day the strip shows, read when a scroll ends (touch or arrows), so the arrows know where they stand.
  const [shown, setShown] = useState<LocalDate>(() => mondayOf(day));

  // Show the chosen day's week when the chosen day is out of sight (the first paint, "Hoy", another week).
  useEffect(() => {
    const list = strip.current;
    const pill = list?.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (!list || !pill) return;
    const left = pill.offsetLeft - list.scrollLeft;
    if (left >= 0 && left + pill.offsetWidth <= list.clientWidth) return;
    const monday = mondayOf(day);
    list.scrollTo({ left: list.querySelector<HTMLElement>(`[data-day="${monday}"]`)?.offsetLeft ?? pill.offsetLeft });
    setShown(monday);
  }, [day]);

  // A refusal is a database that could not answer in time, or a sede retired since the page read the rooms.
  if (!data) throw new Error(`getFacilityMonth: ${result.ok ? "" : result.reason}`);

  // Free slots per day over the month's six weeks, for the rooms the filters leave: the pills' counts, and the frames
  // of "Ir a fecha" on every day with one.
  const slots = new Map<LocalDate, number>();
  for (let week = data.from; week <= data.to; week = addDays(week, 7)) {
    for (const [date, free] of freeSlotsByDay(data, rooms, week, now)) slots.set(date, free);
  }
  const withRoom = [...slots].filter(([, free]) => free > 0).map(([date]) => date);
  const from = bookableFrom(data, day, now);
  const { opensAt, closesAt } = data.facility;

  const events: EventInput[] = [
    ...matrixBusy(data, rooms, day).map(({ column, span }) => {
      const state = busyStateOf(span);
      return {
        id: `${column}-${span.start}-${state}`,
        title: legend(state),
        extendedProps: { card: { variant: state, label: legend(state) } satisfies CardData },
        start: columnTime(column, span.start),
        end: columnTime(column, span.end),
        ...BUSY_LOOK[state],
      } satisfies EventInput;
    }),
    // The part of today already gone, hatched in every column. A day that takes nothing is drawn by the columns
    // themselves (`closedLaneOptions`), not by an event.
    ...(from > opensAt && from < closesAt
      ? rooms.map((room, column) => ({
          id: `past-${room.id}`,
          start: columnTime(column, opensAt),
          end: columnTime(column, from),
          ...UNAVAILABLE_LOOK,
        }))
      : []),
    ...(draft
      ? [
          {
            id: "draft",
            title: t("draft"),
            extendedProps: { card: { variant: "draft", label: t("draft") } satisfies CardData },
            start: columnTime(draft.column, draft.start),
            end: columnTime(draft.column, draft.start + draft.minutes),
            ...DRAFT_LOOK,
          },
        ]
      : []),
  ];

  // Every day the server read: touch scrolls through them and the arrows a week at a time, with no server call; only an
  // arrow past the first or last week reads another month (`showWeek`).
  const days = Array.from({ length: 42 }, (_, index) => addDays(data.from, index)).filter((date) => date <= data.to);
  const shownWeek = mondayOf(shown);
  // Back: the start of the week partly shown, or the one before. Forward: the next week.
  const previousWeek = shown === shownWeek ? addDays(shownWeek, -7) : shownWeek;
  const nextWeek = addDays(shownWeek, 7);
  /**
   * Scroll the strip to the week of `monday` and mark its first open day; nothing is chosen. Past the weeks the server
   * read, there is nothing to scroll to: that week's first open day is chosen, which reads its month.
   */
  const showWeek = (monday: LocalDate) => {
    const list = strip.current;
    const pill = list?.querySelector<HTMLElement>(`[data-day="${monday}"]`);
    if (!list || !pill) {
      const week = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
      onDay(week.find((date) => isOpenWeekday(date, data.facility)) ?? monday);
      return;
    }
    list.scrollTo({ left: pill.offsetLeft, behavior: "smooth" });
    setShown(monday);
    const open = days.find((date) => date >= monday && isOpenWeekday(date, data.facility));
    if (open && open <= addDays(monday, 6)) setRing({ day, at: open });
  };
  /** The first pill fully in sight, after a scroll ends. */
  const readShown = () => {
    const list = strip.current;
    if (!list) return;
    const first = [...list.querySelectorAll<HTMLElement>("[data-day]")].find(
      (pill) => pill.offsetLeft >= list.scrollLeft - 1,
    );
    if (first?.dataset.day) setShown(first.dataset.day as LocalDate);
  };
  const draftRoom = draft ? rooms[draft.column] : undefined;
  const filtered = query.trim() !== "" || size !== "todas";

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "bg-card flex flex-col overflow-hidden rounded-xl border shadow-sm",
          view === "calendario" && className,
        )}
      >
        <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-lg leading-none font-medium first-letter:uppercase" aria-live="polite">
              {format.dateTime(noon(day), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t(view === "calendario" ? "instructions" : "instructionsCards")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* The week moves with the arrows of the day strip below; this toolbar only jumps to today or a date. */}
            {/*
              Filled like the view toggle while today is the chosen day, so the toolbar says where the matrix stands.
              `aria-current`, not `aria-pressed`: a click on it never turns it off, it scrolls back to the time line.
            */}
            <Button
              variant="outline"
              aria-current={day === today ? "date" : undefined}
              className="aria-[current=date]:bg-primary aria-[current=date]:text-primary-foreground aria-[current=date]:hover:bg-primary/90 aria-[current=date]:hover:text-primary-foreground h-11"
              // Today again scrolls back to the time line; another day opens today, which starts on it.
              onClick={() =>
                day === today ? calendar.current?.scrollToTime(scrollTimeFor(data, [], today, now)) : onDay(today)
              }
            >
              {t("today")}
            </Button>
            <DatePickerButton
              selected={day}
              onPick={onDay}
              label={t("goTo")}
              isDisabled={(date) => !isOpenWeekday(date, data.facility)}
              defaultMonth={day}
              today={today}
              marks={{ days: withRoom, marked: dayLegend("legendAvailable"), unmarked: dayLegend("legendUnavailable") }}
            >
              {t("goTo")}
            </DatePickerButton>
          </div>
        </div>
        <div className="flex items-center gap-1 border-b p-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-11 shrink-0"
            aria-label={t("previousWeek")}
            onClick={() => showWeek(previousWeek)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <ul
            ref={strip}
            onScrollEnd={readShown}
            className="relative flex min-w-0 flex-1 touch-pan-x snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
            aria-label={t("days")}
          >
            {days.map((date) => {
              const open = isOpenWeekday(date, data.facility);
              const selected = date === day;
              const past = date < today;
              const free = slots.get(date) ?? 0;
              return (
                // A week fills the strip on a wide screen; on a narrow one a pill keeps 6rem and touch scrolls.
                <li key={date} data-day={date} className="w-[max(6rem,calc((100%-1.5rem)/7))] shrink-0 snap-start">
                  <button
                    type="button"
                    disabled={!open}
                    aria-pressed={selected}
                    onClick={() => onDay(date)}
                    className={cn(
                      // A transparent 2px border on every pill, so the arrows' mark colors it without moving anything.
                      "flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-transparent px-2 py-1.5 text-sm transition-colors",
                      "hover:bg-muted focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] disabled:opacity-50",
                      // A day gone, or with nothing left to book, reads quieter than one with room.
                      !selected && (past || free === 0) && "text-muted-foreground",
                      selected && "bg-primary text-primary-foreground hover:bg-primary",
                      // The arrows' mark: a border drawn inside the pill, so it never reads as keyboard focus.
                      date === cursor && !selected && "border-primary",
                    )}
                  >
                    <span className="font-medium first-letter:uppercase">
                      {format.dateTime(noon(date), { weekday: "short", day: "numeric", timeZone: "UTC" })}
                    </span>
                    {open && past ? (
                      // Gone, not full: the legend's "Ya pasó" instead of "0 libres" (no hatch: it would cut through the text).
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-xs",
                          selected ? "border-primary-foreground/60" : "bg-card border-input",
                        )}
                      >
                        {t("past")}
                      </span>
                    ) : open ? (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                          selected && "bg-primary-foreground text-primary",
                          !selected && (free > 0 ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"),
                        )}
                      >
                        {t("free", { count: free })}
                      </span>
                    ) : (
                      <span className="text-xs">{t("closed")}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <Button
            size="icon"
            variant="ghost"
            className="size-11 shrink-0"
            aria-label={t("nextWeek")}
            onClick={() => showWeek(nextWeek)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        {view === "calendario" && rooms.length > 0 ? <BookingLegend className="border-b px-4 py-2" /> : null}

        {rooms.length === 0 ? (
          <Empty className="p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <DoorOpen aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("noRooms")}</EmptyTitle>
              <EmptyDescription>
                {filtered ? t("noRoomsSize", { people }) : t("noRoomsDescription", { people })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : view === "grilla" ? (
          <div className="p-4">
            <RoomCards month={data} rooms={rooms} day={day} now={now} />
          </div>
        ) : mounted ? (
          // A room column needs about 11rem to read; more rooms than fit scroll sideways (FullCalendar's own
          // `dayMinWidth` is in the paid scrollgrid plugin). The height is the frame's: the grid scrolls inside it.
          <div className="min-h-0 flex-1 overflow-x-auto">
            <div
              className="relative h-full"
              style={{ minWidth: `calc(4rem + ${rooms.length} * 11rem)` }}
              {...hover.handlers}
            >
              {hover.overlay}
              <EventCalendarViews
                // The columns are the rooms: a new set of rooms is a new grid.
                key={`${day}:${rooms.map((room) => room.id).join(",")}`}
                // Every column is the same day: when it takes nothing, every room's column reads as gone.
                {...closedLaneOptions(() => from >= closesAt)}
                plugins={plugins}
                locale={esLocale}
                timeZone="UTC"
                initialView="rooms"
                initialDate={columnDate(0)}
                views={{
                  timeGrid: { ...roomTimeGrid(zoneOffset(zone, now)), ...EVENT_CARD_VIEW },
                  rooms: { type: "timeGrid", duration: { days: rooms.length } },
                }}
                eventClick={(info) => {
                  const card = info.event.extendedProps.card as CardData | undefined;
                  if (card?.variant !== "mine" || !info.event.start || !info.event.end) return;
                  // A column is a room on the matrix's one day: back to the room and that day's wall clock.
                  const from = cellOf(info.event.start);
                  const to = cellOf(info.event.end);
                  const room = rooms[from.column];
                  if (!room) return;
                  const at = (minutes: number) => new Date(`${day}T${timeOf(minutes)}:00Z`);
                  setMine({ room: room.name, start: at(from.minutes), end: at(to.minutes) });
                }}
                headerToolbar={false}
                popoverCloseContent={() => (
                  <XIcon className="text-muted-foreground group-hover:text-foreground size-5" />
                )}
                {...ROOM_CALENDAR_OPTIONS}
                {...hover.options}
                height="100%"
                datesSet={(info) => {
                  calendar.current = info.view.calendar;
                }}
                scrollTime={scrollTimeFor(
                  data,
                  rooms.map((room) => room.id),
                  day,
                  now,
                )}
                allDaySlot={false}
                slotMinTime={timeOf(opensAt)}
                slotMaxTime={timeOf(closesAt)}
                slotDuration="00:30:00"
                slotHeaderFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                dayHeaderContent={(info) => {
                  const room = rooms[cellOf(info.date).column];
                  if (!room) return null;
                  return (
                    <span className="flex flex-col items-start gap-0.5 px-2 py-1 text-start">
                      <Link href={`/salas/${room.id}?fecha=${day}`} className="font-semibold hover:underline">
                        {room.name}
                      </Link>
                      <span className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
                        <span className="flex items-center gap-1">
                          <Users aria-hidden className="size-3" />
                          {t("capacity", { count: room.capacity })}
                        </span>
                        <span className="text-primary tabular-nums">
                          {t("free", { count: freeSlotCount(data, room.id, day, now) })}
                        </span>
                      </span>
                    </span>
                  );
                }}
                events={events}
                selectable
                selectMirror
                unselectAuto={false}
                // Busy time cannot be picked; the hatched background is refused by `selectAllow` instead.
                selectOverlap={(event) => event.display === "background"}
                selectAllow={(span) => {
                  const start = cellOf(span.start);
                  const end = cellOf(new Date(span.end.getTime() - 1));
                  const minutes = (span.end.getTime() - span.start.getTime()) / 60_000;
                  return start.column === end.column && start.minutes >= from && minutes <= BOOKING_RULES.maxMinutes;
                }}
                select={(info) => {
                  info.view.calendar.unselect();
                  const start = cellOf(info.start);
                  const room = rooms[start.column];
                  if (!room) return;
                  // A click picks one slot: offer an hour when it fits, else the longest that does up to the pick.
                  const picked = (info.end.getTime() - info.start.getTime()) / 60_000;
                  const wanted = Math.max(picked, 60);
                  const { durations } = roomOptions(data, room.id, day, now, start.minutes);
                  const minutes = durations.filter((length) => length <= wanted).at(-1) ?? picked;
                  setDraft({ column: start.column, start: start.minutes, minutes });
                }}
              />
            </div>
          </div>
        ) : (
          <Skeleton className="min-h-0 w-full flex-1 rounded-none" />
        )}
      </div>

      <MyBookingDetails shown={mine} onClose={() => setMine(null)} />

      {draft && draftRoom ? (
        <BookSlotDialog
          month={data}
          room={draftRoom}
          day={day}
          now={now}
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </div>
  );
}
