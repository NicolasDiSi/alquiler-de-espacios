"use client";

import { useEffect, useMemo, useState } from "react";

import type { OperatorBlockTarget, OperatorBookingView } from "@espacios/application";
import { localDateOf, todayAt, weekdayOf } from "@espacios/domain";
import { type EventInput, useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import esLocale from "@fullcalendar/react/locales/es";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { Building2, CalendarOff, ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { DatePickerButton } from "@/components/date-picker-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/hooks/use-mounted";

import { Facts } from "../../../_components/facts";
import { ClientBlockDialog } from "./client-block-dialog";

const VIEWS = ["dayGridMonth", "timeGridWeek", "timeGridDay"] as const;
const plugins = [dayGridPlugin, timeGridPlugin, interactionPlugin];

/** Pages read for one visible range, at most (a month of one client fits in one or two). */
const MAX_PAGES = 10;
const ALL = "all";
/** Weekdays the calendar never shows (Sunday): the picker does not offer them either. */
const HIDDEN_DAYS = [0];
const DAY_MS = 86_400_000;

/** Every booking of the client starting in `[start, end)`, through the documented operator API, page by page. */
async function fetchBookings(
  companyId: string,
  range: { readonly start: Date; readonly end: Date },
  signal: AbortSignal,
): Promise<OperatorBookingView[]> {
  const bookings: OperatorBookingView[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      companyId,
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/v1/operator/bookings?${params}`, { cache: "no-store", signal });
    if (!response.ok) throw new Error(`GET /api/v1/operator/bookings: ${response.status}`);
    const body = (await response.json()) as { bookings: OperatorBookingView[]; nextCursor: string | null };
    bookings.push(...body.bookings);
    cursor = body.nextCursor;
    if (!cursor) break;
  }
  return bookings;
}

const toEvent = (booking: OperatorBookingView): EventInput => ({
  id: booking.id,
  title: booking.room.name,
  start: booking.startsAt,
  end: booking.endsAt,
  // A cancelled booking stays visible, faded and struck through, so a freed slot reads as freed.
  classNames: booking.status === "cancelled" ? ["opacity-50", "line-through"] : [],
  extendedProps: { booking },
});

/**
 * The client's bookings in month, week and day views (spec 0007, AC-3), on the template's `EventCalendarViews`. Read
 * only: clicking a booking shows it. "Bloquear horario", or a range picked in the week or day view, opens the block
 * dialog (prefilled when picked), never a booking: the operator does not book for a client (spec 0004).
 */
export function ClientCalendar({
  clientId,
  timeZone,
  facilities,
  targets,
}: {
  readonly clientId: string;
  readonly timeZone: string;
  /** Sedes where the client booked in the period, for the filter. */
  readonly facilities: readonly string[];
  readonly targets: readonly OperatorBlockTarget[];
}) {
  const t = useTranslations("operator.client.activity.calendar");
  const home = useTranslations("home");
  const format = useFormatter();
  // Re-renders this component on every date or view change, so the title and the view come from it, never from a
  // state set inside the calendar's own callbacks. The controller updates this component as soon as the calendar
  // connects to it, so the calendar renders only once this component has mounted.
  const controller = useCalendarController();
  const mounted = useMounted();
  const [facility, setFacility] = useState<string>(ALL);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [bookings, setBookings] = useState<readonly OperatorBookingView[]>([]);
  const [failed, setFailed] = useState(false);
  const [blocking, setBlocking] = useState<{ selection: { start: Date; end: Date } | null } | null>(null);
  const [shown, setShown] = useState<OperatorBookingView | null>(null);

  // The visible range is read here, after the calendar reports it, and fetched in an effect: the calendar only gets
  // a plain list, so no request of its own resolves on an instance React discarded.
  useEffect(() => {
    if (!range) return;
    const controller = new AbortController();
    fetchBookings(clientId, range, controller.signal)
      .then((found) => {
        setBookings(found);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailed(error instanceof Error);
      });
    return () => controller.abort();
  }, [clientId, range]);

  const visible = useMemo(
    () => bookings.filter((booking) => facility === ALL || booking.room.facilityName === facility),
    [bookings, facility],
  );
  const events = useMemo(() => visible.map(toEvent), [visible]);
  const count = visible.filter((booking) => booking.status === "confirmed").length;

  const view = controller.view;
  const days = view ? Math.round((view.currentEnd.getTime() - view.currentStart.getTime()) / DAY_MS) : 0;
  const canBlock = targets.length > 0;
  // The calendar's current day (today, or the one jumped to), in its zone: the picker opens on it and marks it.
  const current = controller.getDate();
  const shownDay = current ? localDateOf(current, timeZone) : null;

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
            <h3 className="text-lg leading-none font-medium first-letter:uppercase" aria-live="polite">
              {view?.title}
            </h3>
            <p className="text-muted-foreground text-sm">{t("summary", { days, count })}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={facility} onValueChange={setFacility}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("facility")}>
                <Building2 aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectItem value={ALL}>{t("allFacilities")}</SelectItem>
                  {facilities.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <ButtonGroup>
              <Button size="icon" variant="outline" aria-label={t("previous")} onClick={() => controller.prev()}>
                <ChevronLeft aria-hidden />
              </Button>
              <Button variant="outline" onClick={() => controller.today()}>
                {t("today")}
              </Button>
              <Button size="icon" variant="outline" aria-label={t("next")} onClick={() => controller.next()}>
                <ChevronRight aria-hidden />
              </Button>
            </ButtonGroup>
            <DatePickerButton
              selected={shownDay}
              onPick={(date) => controller.gotoDate(date)}
              label={t("goTo")}
              isDisabled={(date) => HIDDEN_DAYS.includes(weekdayOf(date))}
              defaultMonth={shownDay ?? todayAt(new Date(), timeZone)}
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
            {canBlock ? (
              <Button onClick={() => setBlocking({ selection: null })}>
                <CalendarOff aria-hidden />
                {t("block")}
              </Button>
            ) : null}
          </div>
        </div>

        {mounted ? (
          <EventCalendarViews
            controller={controller}
            plugins={plugins}
            initialView={VIEWS[0]}
            locale={esLocale}
            timeZone={timeZone}
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
            selectable={canBlock}
            selectMirror
            // Only the hour views pick a range: a month cell has no times to give.
            selectAllow={(span) => !span.allDay}
            select={(info) => setBlocking({ selection: { start: info.start, end: info.end } })}
            eventClick={(info) => setShown(info.event.extendedProps.booking as OperatorBookingView)}
          />
        ) : (
          <Skeleton className="h-[38rem] w-full rounded-none" />
        )}
      </div>
      {canBlock ? <p className="text-muted-foreground text-sm">{t("selectHint")}</p> : null}

      {blocking ? (
        <ClientBlockDialog
          targets={targets}
          open
          onOpenChange={(open) => (open ? null : setBlocking(null))}
          selection={blocking.selection}
        />
      ) : null}

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
                  { term: home("columns.date"), value: format.dateTime(new Date(shown.startsAt), "short") },
                  {
                    term: home("columns.time"),
                    value: home("timeRange", {
                      start: format.dateTime(new Date(shown.startsAt), "time"),
                      end: format.dateTime(new Date(shown.endsAt), "time"),
                    }),
                  },
                  { term: home("columns.bookedBy"), value: shown.bookedBy.name },
                  { term: home("columns.status"), value: home(`phase.${shown.phase}`) },
                ]}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
