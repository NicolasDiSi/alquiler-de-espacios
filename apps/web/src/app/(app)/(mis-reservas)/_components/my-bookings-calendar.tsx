"use client";

import { useEffect, useMemo, useState } from "react";

import type { BookingView } from "@espacios/application";
import { type BookingPhase, localDateOf, todayAt, weekdayOf } from "@espacios/domain";
import { type EventInput, useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import esLocale from "@fullcalendar/react/locales/es";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { cn } from "cn";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { BUSY_LOOK, dayMarkOptions, FREE_SURFACE, LEGEND_SWATCH } from "@/components/calendar/calendar-look";
import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { type CardData, EVENT_CARD_VIEW } from "@/components/calendar/event-card";
import { DatePickerButton } from "@/components/date-picker-field";
import { Facts } from "@/components/facts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";
import { TIME_ZONE } from "@/i18n/config";

import { CancelBookingButton } from "./cancel-booking-button";

const VIEWS = ["dayGridMonth", "timeGridWeek", "timeGridDay"] as const;
const plugins = [dayGridPlugin, timeGridPlugin];
/** Pages of 100 read per list view for one visible range, at most (a month of a busy company fits in a few). */
const MAX_PAGES = 10;
/** Sundays: no sede opens them. */
const HIDDEN_DAYS = [0];
const DAY_MS = 86_400_000;

type Range = { readonly start: Date; readonly end: Date };

/**
 * Each state's look, copied from the room calendars (`calendar-look.tsx`), so a card means the same on every calendar:
 * a booking still ahead or under way is the company's solid card (`BUSY_LOOK.mine`: `--calendar-mine`, the theme's
 * `--primary`, with `--calendar-mine-foreground` and `--calendar-mine-border`), and one that ended is the quiet grey
 * card (`BUSY_LOOK.booked`: `--calendar-booked`, the theme's `--muted`, with `--calendar-booked-border`). The card's
 * badge names the state too (`event-card.tsx`): color is never the only cue. Cancelled bookings are not on this calendar.
 */
const PHASE_LOOK = {
  upcoming: { look: BUSY_LOOK.mine, variant: "mine" },
  in_progress: { look: BUSY_LOOK.mine, variant: "mine" },
  finished: { look: BUSY_LOOK.booked, variant: "booked" },
  cancelled: { look: BUSY_LOOK.booked, variant: "booked" },
} as const satisfies Record<
  BookingPhase,
  { look: (typeof BUSY_LOOK)[keyof typeof BUSY_LOOK]; variant: CardData["variant"] }
>;

/** The legend: the same swatches (`LEGEND_SWATCH`) as the states above, plus the grey of the days already gone. */
const LEGEND = [
  { key: "active", swatch: LEGEND_SWATCH.mine },
  { key: "finished", swatch: LEGEND_SWATCH.booked },
  { key: "past", swatch: LEGEND_SWATCH.past },
] as const;

/**
 * One API view (`GET /api/v1/bookings`, spec 0003) read page by page until it leaves the range: Próximas runs soonest
 * first, so it stops past the range's end; Pasadas runs latest first, so it stops before its start.
 */
async function readView(view: "upcoming" | "past", range: Range, signal: AbortSignal): Promise<BookingView[]> {
  const found: BookingView[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ view, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/v1/bookings?${params}`, { cache: "no-store", signal });
    if (!response.ok) throw new Error(`GET /api/v1/bookings: ${response.status}`);
    const body = (await response.json()) as { bookings: BookingView[]; nextCursor: string | null };
    found.push(...body.bookings);
    cursor = body.nextCursor;
    const last = body.bookings.at(-1);
    if (!cursor || !last) break;
    const lastStart = Date.parse(last.startsAt);
    if (view === "upcoming" ? lastStart >= range.end.getTime() : lastStart < range.start.getTime()) break;
  }
  return found;
}

/** The company's confirmed bookings that overlap the range: only the API views that can hold them are read. */
async function fetchBookings(range: Range, signal: AbortSignal): Promise<BookingView[]> {
  const now = Date.now();
  const [upcoming, past] = await Promise.all([
    range.end.getTime() > now ? readView("upcoming", range, signal) : [],
    range.start.getTime() < now ? readView("past", range, signal) : [],
  ]);
  return [...upcoming, ...past].filter(
    (booking) =>
      Date.parse(booking.startsAt) < range.end.getTime() && Date.parse(booking.endsAt) > range.start.getTime(),
  );
}

/**
 * Mis reservas as a calendar (spec 0003, amended): every confirmed booking of the company by month, week or day, each
 * card naming the room, its sede and who booked it. A click shows the booking, and one that has not started can be
 * cancelled there, as in the lists. Cancelled bookings stay in their own tab.
 */
export function MyBookingsCalendar() {
  const t = useTranslations("home.calendar");
  const home = useTranslations("home");
  const format = useFormatter();
  // Re-renders this component on every date or view change, so the title and the view come from it.
  const controller = useCalendarController();
  const mounted = useMounted();
  const [range, setRange] = useState<Range | null>(null);
  const [bookings, setBookings] = useState<readonly BookingView[]>([]);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState<BookingView | null>(null);
  // The day asked for ("Ir a fecha" or "Hoy"), today at first: marked in primary, as on the operator's calendar.
  const [picked, setPicked] = useState(() => todayAt(new Date(), TIME_ZONE));

  // The visible range is read after the calendar reports it, and fetched here: the calendar only gets a plain list.
  useEffect(() => {
    if (!range) return;
    const abort = new AbortController();
    fetchBookings(range, abort.signal)
      .then((found) => {
        setBookings(found);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setFailed(error instanceof Error);
      });
    return () => abort.abort();
  }, [range]);

  const events = useMemo(
    () =>
      bookings.map(
        (booking): EventInput => ({
          id: booking.id,
          // The month view's one line: the room and who booked it.
          title: `${booking.room.name} · ${booking.bookedBy.name}`,
          start: booking.startsAt,
          end: booking.endsAt,
          ...PHASE_LOOK[booking.phase].look,
          extendedProps: {
            booking,
            card: {
              variant: PHASE_LOOK[booking.phase].variant,
              label: home(`phase.${booking.phase}`),
              title: booking.room.name,
              detail: `${booking.room.facilityName} · ${booking.bookedBy.name}`,
            } satisfies CardData,
          },
        }),
      ),
    [bookings, home],
  );

  const view = controller.view;
  // The calendar's current day (today, or the one jumped to): the picker opens on its month.
  const current = controller.getDate();
  const shownDay = current ? localDateOf(current, TIME_ZONE) : null;
  const days = view ? Math.round((view.currentEnd.getTime() - view.currentStart.getTime()) / DAY_MS) : 0;
  const date = (iso: string) => format.dateTime(new Date(iso), "short");
  const time = (booking: BookingView) =>
    home("timeRange", {
      start: format.dateTime(new Date(booking.startsAt), "time"),
      end: format.dateTime(new Date(booking.endsAt), "time"),
    });

  return (
    <div className="flex flex-col gap-3">
      {failed ? (
        <Alert variant="destructive">
          <AlertDescription>{t("loadError")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col overflow-hidden rounded-md border">
        <div className="bg-sidebar text-sidebar-foreground flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 shrink-0 flex-col gap-1">
            <h2 className="text-lg leading-none font-medium first-letter:uppercase" aria-live="polite">
              {view?.title}
            </h2>
            <p className="text-muted-foreground text-sm">{t("summary", { days, count: bookings.length })}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ButtonGroup>
              <Button size="icon" variant="outline" aria-label={t("previous")} onClick={() => controller.prev()}>
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPicked(todayAt(new Date(), TIME_ZONE));
                  controller.today();
                }}
              >
                {t("today")}
              </Button>
              <Button size="icon" variant="outline" aria-label={t("next")} onClick={() => controller.next()}>
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
              isDisabled={(date) => HIDDEN_DAYS.includes(weekdayOf(date))}
              defaultMonth={shownDay ?? todayAt(new Date(), TIME_ZONE)}
              today={todayAt(new Date(), TIME_ZONE)}
            >
              {t("goTo")}
            </DatePickerButton>
            <Select value={view?.type ?? VIEWS[0]} onValueChange={(next) => controller.changeView(next)}>
              <SelectTrigger aria-label={t("view")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {VIEWS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`views.${key}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        {mounted ? (
          <EventCalendarViews
            controller={controller}
            {...FREE_SURFACE}
            {...dayMarkOptions(
              // The day asked for is filled; the days before today are the plain grey of "Ya pasó", as on every calendar.
              (day) => localDateOf(day, TIME_ZONE) === picked,
              (day) => localDateOf(day, TIME_ZONE) < todayAt(new Date(), TIME_ZONE),
            )}
            plugins={plugins}
            views={{ timeGrid: EVENT_CARD_VIEW }}
            initialView={VIEWS[0]}
            locale={esLocale}
            timeZone={TIME_ZONE}
            popoverCloseContent={() => <XIcon className="text-muted-foreground group-hover:text-foreground size-5" />}
            events={events}
            datesSet={(info) =>
              setRange((current) =>
                current?.start.getTime() === info.start.getTime() && current.end.getTime() === info.end.getTime()
                  ? current
                  : { start: info.start, end: info.end },
              )
            }
            nowIndicator
            allDaySlot={false}
            hiddenDays={HIDDEN_DAYS}
            slotMinTime="07:00"
            slotMaxTime="21:00"
            dayMaxEvents={3}
            eventClick={(info) => setShown((info.event.extendedProps as { booking: BookingView }).booking)}
          />
        ) : (
          <Skeleton className="h-[38rem] w-full rounded-none" />
        )}
      </div>

      <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {LEGEND.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3.5 rounded-sm border", item.swatch)} />
            {t(`legend.${item.key}`)}
          </li>
        ))}
      </ul>

      <Dialog open={shown !== null} onOpenChange={(open) => (open ? null : setShown(null))}>
        <DialogContent>
          {shown ? (
            <>
              <DialogHeader>
                <DialogTitle>{shown.room.name}</DialogTitle>
                <DialogDescription>{shown.room.facilityName}</DialogDescription>
              </DialogHeader>
              <Facts
                items={[
                  { term: home("columns.date"), value: date(shown.startsAt) },
                  { term: home("columns.time"), value: time(shown) },
                  { term: home("columns.bookedBy"), value: shown.bookedBy.name },
                  { term: home("columns.status"), value: home(`phase.${shown.phase}`) },
                ]}
              />
              {shown.phase === "upcoming" ? (
                <DialogFooter>
                  <CancelBookingButton
                    booking={shown}
                    summary={{ room: shown.room.name, date: date(shown.startsAt), time: time(shown) }}
                    onGone={(id) => {
                      setShown(null);
                      setBookings((current) => current.filter((booking) => booking.id !== id));
                    }}
                  />
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
