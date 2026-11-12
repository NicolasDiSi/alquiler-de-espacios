"use client";

import { use, useMemo, useState } from "react";

import Link from "next/link";

import type { FacilityMonth } from "@espacios/application";
import { addDays, BOOKING_RULES, isOpenWeekday, type LocalDate, type Result } from "@espacios/domain";
import type { EventInput } from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/react/interaction";
import esLocale from "@fullcalendar/react/locales/es";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { cn } from "cn";
import { DoorOpen, Users, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";
import { indexMonth } from "@/lib/bookings/month";
import {
  bookableFrom,
  cellOf,
  columnDate,
  columnTime,
  freeSlotsByDay,
  matrixBusy,
  matrixRooms,
  roomOptions,
} from "@/lib/bookings/room-matrix";
import { timeOf } from "@/lib/bookings/search";

import { BookSlotDialog, type Draft } from "./book-slot-dialog";

const plugins = [timeGridPlugin, interactionPlugin];
const noon = (date: LocalDate) => new Date(`${date}T12:00:00Z`);

/** One color per state; the event's title says the same in words. */
const STATE_COLOR = {
  booked: "var(--muted-foreground)",
  mine: "var(--primary)",
  blocked: "var(--border)",
} as const;

/**
 * The week's rooms matrix (spec 0009): seven day pills (the days the sede opens enabled, each with its free slots for
 * the people) and the chosen day as a time grid with a column per room. Busy time reads "Ocupada", "Tu reserva" or "No
 * disponible", never whose. Picking a free range in one column draws a card for it and opens the booking dialog;
 * closing the dialog drops both.
 */
export function RoomMatrix({
  week,
  monday,
  day,
  people,
  now,
  onDay,
}: {
  readonly week: Promise<Result<FacilityMonth>>;
  readonly monday: LocalDate;
  readonly day: LocalDate;
  readonly people: number;
  readonly now: Date;
  readonly onDay: (date: LocalDate) => void;
}) {
  const t = useTranslations("rooms.matrix");
  const legend = useTranslations("booking.timeline.legend");
  const format = useFormatter();
  const mounted = useMounted();
  const result = use(week);
  const data = useMemo(() => (result.ok ? indexMonth(result.value) : null), [result]);
  const [draft, setDraft] = useState<Draft | null>(null);
  // A refusal is a database that could not answer in time, or a sede retired since the page read the rooms.
  if (!data) throw new Error(`getFacilityMonth: ${result.ok ? "" : result.reason}`);

  const rooms = matrixRooms(data, people);
  const slots = freeSlotsByDay(data, people, monday, now);
  const from = bookableFrom(data, day, now);
  const { opensAt, closesAt } = data.facility;

  const events: EventInput[] = [
    ...matrixBusy(data, rooms, day).map(({ column, span }) => {
      const state = span.kind === "blocked" ? "blocked" : span.mine ? "mine" : "booked";
      return {
        id: `${column}-${span.start}-${state}`,
        title: legend(state),
        start: columnTime(column, span.start),
        end: columnTime(column, span.end),
        color: STATE_COLOR[state],
        textColor: state === "blocked" ? "var(--foreground)" : undefined,
        classNames:
          state === "blocked" ? ["bg-[repeating-linear-gradient(135deg,var(--border)_0_4px,transparent_4px_8px)]"] : [],
      } satisfies EventInput;
    }),
    // Time that can no longer be booked (past, or a day that takes no bookings), shaded in every column.
    ...(from > opensAt
      ? rooms.map((room, column) => ({
          id: `past-${room.id}`,
          start: columnTime(column, opensAt),
          end: columnTime(column, from),
          display: "background",
          color: "var(--muted-foreground)",
        }))
      : []),
    ...(draft
      ? [
          {
            id: "draft",
            title: t("draft"),
            start: columnTime(draft.column, draft.start),
            end: columnTime(draft.column, draft.start + draft.minutes),
            color: "var(--chart-2)",
            classNames: ["ring-2", "ring-primary"],
          },
        ]
      : []),
  ];

  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const draftRoom = draft ? rooms[draft.column] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <ul className="bg-card flex gap-2 overflow-x-auto rounded-xl border p-2 shadow-sm" aria-label={t("days")}>
        {days.map((date) => {
          const open = isOpenWeekday(date, data.facility);
          const selected = date === day;
          return (
            <li key={date} className="min-w-28 flex-1">
              <button
                type="button"
                disabled={!open}
                aria-pressed={selected}
                onClick={() => onDay(date)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  "hover:bg-muted focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] disabled:opacity-40",
                  selected && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                <span className="font-medium first-letter:uppercase">
                  {format.dateTime(noon(date), { weekday: "short", day: "numeric", timeZone: "UTC" })}
                </span>
                {open ? (
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                      selected ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t("free", { count: slots.get(date) ?? 0 })}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {rooms.length === 0 ? (
        <Empty className="bg-card border p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DoorOpen aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t("noRooms")}</EmptyTitle>
            <EmptyDescription>{t("noRoomsDescription", { people })}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
          <p className="text-muted-foreground border-b px-4 py-2 text-sm" aria-live="polite">
            {t("hint", {
              day: format.dateTime(noon(day), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
            })}
          </p>
          {mounted ? (
            // A room column needs about 11rem to read; more rooms than fit scroll sideways (FullCalendar's own
            // `dayMinWidth` is in the paid scrollgrid plugin).
            <div className="overflow-x-auto">
              <div style={{ minWidth: `calc(4rem + ${rooms.length} * 11rem)` }}>
                <EventCalendarViews
                  // The columns are the rooms: a new set of rooms is a new grid.
                  key={`${day}:${rooms.map((room) => room.id).join(",")}`}
                  plugins={plugins}
                  locale={esLocale}
                  timeZone="UTC"
                  initialView="rooms"
                  initialDate={columnDate(0)}
                  views={{ rooms: { type: "timeGrid", duration: { days: rooms.length } } }}
                  headerToolbar={false}
                  popoverCloseContent={() => (
                    <XIcon className="text-muted-foreground group-hover:text-foreground size-5" />
                  )}
                  height="auto"
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
                        <Link href={`/salas/${room.id}`} className="font-semibold hover:underline">
                          {room.name}
                        </Link>
                        <span className="text-muted-foreground flex items-center gap-1 text-xs font-normal">
                          <Users aria-hidden className="size-3" />
                          {t("capacity", { count: room.capacity })}
                        </span>
                      </span>
                    );
                  }}
                  events={events}
                  selectable
                  selectMirror
                  unselectAuto={false}
                  selectOverlap={false}
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
            <Skeleton className="h-[40rem] w-full rounded-none" />
          )}
        </div>
      )}

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
