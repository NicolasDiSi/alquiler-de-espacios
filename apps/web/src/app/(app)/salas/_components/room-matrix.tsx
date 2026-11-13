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
import { ButtonGroup } from "@/components/ui/button-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useClock } from "@/hooks/use-clock";
import { useMounted } from "@/hooks/use-mounted";
import { indexMonth, type MonthData } from "@/lib/bookings/month";
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
import { matchesName, type RoomSize, type RoomsView, timeOf } from "@/lib/bookings/search";
import { zoneOffset } from "@/lib/operator/format";

import { RoomCards } from "./room-cards";

const plugins = [timeGridPlugin, interactionPlugin];
const noon = (date: LocalDate) => new Date(`${date}T12:00:00Z`);

/** The closest day the sede opens before (`step` -1) or after (`step` 1) `day`, within two weeks. */
function openDayFrom(month: MonthData, day: LocalDate, step: 1 | -1): LocalDate | null {
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = addDays(day, offset * step);
    if (isOpenWeekday(candidate, month.facility)) return candidate;
  }
  return null;
}

/**
 * The week's rooms (spec 0009). A strip of seven day pills (the days the sede opens enabled, each with its free slots
 * for the rooms the filters leave), scrolled by touch, with arrows to the previous and next open day; then the chosen
 * day in a card headed as the room detail's calendar (the day as title, how to book, week and today controls and the
 * legend), as a time grid with a column per room (its header opens the room) or as cards. Busy time reads "Ocupada",
 * "Tu reserva" or "No disponible", never whose. Picking a free range in one column draws a card for it and opens the
 * booking dialog; closing the dialog drops both.
 */
export function RoomMatrix({
  week,
  monday,
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
  readonly monday: LocalDate;
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

  // Keep the chosen day's pill in sight when the strip scrolls sideways (a phone, or a narrow column).
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>(`[data-day="${day}"]`)
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [day]);

  // A refusal is a database that could not answer in time, or a sede retired since the page read the rooms.
  if (!data) throw new Error(`getFacilityMonth: ${result.ok ? "" : result.reason}`);

  const slots = freeSlotsByDay(data, rooms, monday, now);
  const from = bookableFrom(data, day, now);
  const { opensAt, closesAt } = data.facility;
  const previousDay = openDayFrom(data, day, -1);
  const nextDay = openDayFrom(data, day, 1);

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

  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const draftRoom = draft ? rooms[draft.column] : undefined;
  const filtered = query.trim() !== "" || size !== "todas";

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card flex items-center gap-1 rounded-xl border p-1 shadow-sm">
        <Button
          size="icon"
          variant="ghost"
          className="size-11 shrink-0"
          aria-label={t("previousDay")}
          disabled={!previousDay}
          onClick={() => (previousDay ? onDay(previousDay) : null)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <ul
          ref={strip}
          className="flex min-w-0 flex-1 touch-pan-x snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
          aria-label={t("days")}
        >
          {days.map((date) => {
            const open = isOpenWeekday(date, data.facility);
            const selected = date === day;
            const past = date < today;
            const free = slots.get(date) ?? 0;
            return (
              <li key={date} data-day={date} className="min-w-24 flex-1 snap-start">
                <button
                  type="button"
                  disabled={!open}
                  aria-pressed={selected}
                  onClick={() => onDay(date)}
                  className={cn(
                    "flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors",
                    "hover:bg-muted focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] disabled:opacity-50",
                    // A day gone, or with nothing left to book, reads quieter than one with room.
                    !selected && (past || free === 0) && "text-muted-foreground",
                    selected && "bg-primary text-primary-foreground hover:bg-primary",
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
          aria-label={t("nextDay")}
          disabled={!nextDay}
          onClick={() => (nextDay ? onDay(nextDay) : null)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>

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
            <ButtonGroup>
              <Button
                size="icon"
                variant="outline"
                className="size-11"
                aria-label={t("previousWeek")}
                onClick={() => onDay(addDays(day, -7))}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                variant="outline"
                className="h-11"
                // Today again scrolls back to the time line; another day opens today, which starts on it.
                onClick={() =>
                  day === today ? calendar.current?.scrollToTime(scrollTimeFor(data, [], today, now)) : onDay(today)
                }
              >
                {t("today")}
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-11"
                aria-label={t("nextWeek")}
                onClick={() => onDay(addDays(day, 7))}
              >
                <ChevronRight aria-hidden />
              </Button>
            </ButtonGroup>
            <DatePickerButton
              selected={day}
              onPick={onDay}
              label={t("goTo")}
              isDisabled={(date) => !isOpenWeekday(date, data.facility)}
              defaultMonth={day}
              today={today}
            >
              {t("goTo")}
            </DatePickerButton>
          </div>
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
