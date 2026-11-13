"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import type { OperatorBlockTarget, OperatorBookingView } from "@espacios/application";
import { localDateOf, todayAt, weekdayOf } from "@espacios/domain";
import { type EventInput, useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import esLocale from "@fullcalendar/react/locales/es";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { Building2, CalendarOff, ChevronLeft, ChevronRight, DoorOpen, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { BUSY_LOOK, CANCELLED_CLASS, dayMarkOptions, FREE_SURFACE } from "@/components/calendar/calendar-look";
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

import { BlockSlotDialog } from "./block-slot-dialog";
import type { ActivitySubject } from "./subject";

const VIEWS = ["dayGridMonth", "timeGridWeek", "timeGridDay"] as const;
type CalendarView = (typeof VIEWS)[number];
const plugins = [dayGridPlugin, timeGridPlugin, interactionPlugin];

/** Pages read for one visible range, at most (a month of one client or one sede fits in a few). */
const MAX_PAGES = 10;
const ALL = "all";
/** Weekdays the calendar never shows (Sunday): the picker does not offer them either. */
const HIDDEN_DAYS = [0];
const DAY_MS = 86_400_000;

/** The operator API's filter for each subject; every sede needs none. */
const SCOPE_PARAM = { client: "companyId", facility: "facilityId", all: null } as const satisfies Record<
  ActivitySubject,
  string | null
>;

/** Every booking of the subject starting in `[start, end)`, through the documented operator API, page by page. */
async function fetchBookings(
  subject: ActivitySubject,
  id: string,
  range: { readonly start: Date; readonly end: Date },
  signal: AbortSignal,
): Promise<OperatorBookingView[]> {
  const bookings: OperatorBookingView[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const scope = SCOPE_PARAM[subject];
    const params = new URLSearchParams({
      ...(scope ? { [scope]: id } : {}),
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

/** An active block as `GET /api/v1/operator/blocks` answers it (a `BlockRecord` in JSON). */
type BlockJson = {
  readonly id: string;
  readonly facilityId: string;
  /** `null` closes the whole sede. */
  readonly roomId: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
};

/** A block placed on the calendar: its sede's and room's names, for the title and the filter. */
type PlacedBlock = BlockJson & { readonly facilityName: string; readonly roomName: string | null };

/**
 * The active blocks of the sedes the operator can block here (a sede's own, or a client's sedes), overlapping
 * `[start, end)`. The API lists every active block of a sede, so the range is applied here.
 */
async function fetchBlocks(
  targets: readonly OperatorBlockTarget[],
  range: { readonly start: Date; readonly end: Date },
  signal: AbortSignal,
): Promise<PlacedBlock[]> {
  const lists = await Promise.all(
    targets.map(async ({ facility, rooms }) => {
      const params = new URLSearchParams({ facilityId: facility.id });
      const response = await fetch(`/api/v1/operator/blocks?${params}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error(`GET /api/v1/operator/blocks: ${response.status}`);
      const body = (await response.json()) as { blocks: BlockJson[] };
      const names = new Map(rooms.map((room) => [room.id, room.name]));
      return body.blocks.map((block) => ({
        ...block,
        facilityName: facility.name,
        roomName: block.roomId ? (names.get(block.roomId) ?? null) : null,
      }));
    }),
  );
  return lists.flat().filter((block) => new Date(block.startsAt) < range.end && new Date(block.endsAt) > range.start);
}

/** What the filter narrows by: a client's (or every) sede, a sede's rooms. */
const filterKey = (subject: ActivitySubject, booking: OperatorBookingView) =>
  subject === "facility" ? booking.room.name : booking.room.facilityName;

/** A booking on the operator's calendar: quiet like any booking, its card naming the client (or the room) and who booked. */
const toEvent = (subject: ActivitySubject, booking: OperatorBookingView, phase: string): EventInput => ({
  id: booking.id,
  // A sede's calendar mixes clients, so each booking also says whose it is.
  title: subject === "client" ? booking.room.name : `${booking.room.name} · ${booking.company.name}`,
  start: booking.startsAt,
  end: booking.endsAt,
  ...BUSY_LOOK.booked,
  className:
    booking.status === "cancelled" ? `${BUSY_LOOK.booked.className} ${CANCELLED_CLASS}` : BUSY_LOOK.booked.className,
  extendedProps: {
    booking,
    card: {
      variant: "booked",
      label: phase,
      title: subject === "client" ? booking.room.name : booking.company.name,
      detail: `${subject === "client" ? booking.room.facilityName : booking.room.name} · ${booking.bookedBy.name}`,
      cancelled: booking.status === "cancelled",
    } satisfies CardData,
  },
});

/**
 * The bookings of a client or a sede in month, week and day views (spec 0007, AC-3), on the template's
 * `EventCalendarViews`, on the month unless `initialView` says otherwise. A client's filter narrows by sede, a sede's by room. Read only: clicking a booking shows it. "Bloquear horario", or a range picked in the week or day view, opens the block
 * dialog (prefilled when picked), never a booking: the operator does not book for a client (spec 0004).
 */
export function ActivityCalendar({
  subject,
  id,
  timeZone,
  options,
  targets,
  initialView = "dayGridMonth",
}: {
  readonly subject: ActivitySubject;
  /** The client's or the sede's id; ignored for every sede. */
  readonly id: string;
  readonly timeZone: string;
  /** For a client (or every sede), the sedes booked in the period; for a sede, its rooms. By name, for the filter. */
  readonly options: readonly string[];
  readonly targets: readonly OperatorBlockTarget[];
  /** The view it opens on: the month on Actividad, the week on the sede's Bloqueos tab. */
  readonly initialView?: CalendarView;
}) {
  const t = useTranslations("operator.activity.calendar");
  const home = useTranslations("home");
  const details = useTranslations("calendar.details");
  const format = useFormatter();
  // Re-renders this component on every date or view change, so the title and the view come from it, never from a
  // state set inside the calendar's own callbacks. The controller updates this component as soon as the calendar
  // connects to it, so the calendar renders only once this component has mounted.
  const controller = useCalendarController();
  const mounted = useMounted();
  const [narrow, setNarrow] = useState<string>(ALL);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [bookings, setBookings] = useState<readonly OperatorBookingView[]>([]);
  const [failed, setFailed] = useState(false);
  const [blocking, setBlocking] = useState<{ selection: { start: Date; end: Date } | null } | null>(null);
  const [shown, setShown] = useState<OperatorBookingView | null>(null);
  const [shownBlock, setShownBlock] = useState<PlacedBlock | null>(null);
  // The day the operator asked for ("Ir a fecha" or "Hoy"), today at first: marked in primary; prev and next leave it.
  const [picked, setPicked] = useState(() => todayAt(new Date(), timeZone));
  const [blocks, setBlocks] = useState<readonly PlacedBlock[]>([]);

  // The visible range is read here, after the calendar reports it, and fetched in an effect: the calendar only gets
  // a plain list, so no request of its own resolves on an instance React discarded.
  useEffect(() => {
    if (!range) return;
    const controller = new AbortController();
    Promise.all([fetchBookings(subject, id, range, controller.signal), fetchBlocks(targets, range, controller.signal)])
      .then(([found, closed]) => {
        setBookings(found);
        setBlocks(closed);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailed(error instanceof Error);
      });
    return () => controller.abort();
  }, [subject, id, range, targets]);

  const visible = useMemo(
    () => bookings.filter((booking) => narrow === ALL || filterKey(subject, booking) === narrow),
    [bookings, narrow, subject],
  );
  const events = useMemo(() => {
    // A block on the whole sede shows under any room filter; a room's block only under its room (or its sede).
    const shownBlocks = blocks.filter(
      (block) =>
        narrow === ALL ||
        (subject === "facility" ? block.roomName === null || block.roomName === narrow : block.facilityName === narrow),
    );
    return [
      ...shownBlocks.map(
        (block): EventInput => ({
          id: `block-${block.id}`,
          title: t("blockEvent", { target: block.roomName ?? t("wholeFacility"), reason: block.reason }),
          start: block.startsAt,
          end: block.endsAt,
          ...BUSY_LOOK.blocked,
          extendedProps: {
            block,
            card: {
              variant: "blocked",
              label: details("block"),
              title: block.reason,
              detail: block.roomName ?? t("wholeFacility"),
            } satisfies CardData,
          },
        }),
      ),
      ...visible.map((booking) => toEvent(subject, booking, home(`phase.${booking.phase}`))),
    ];
  }, [blocks, visible, subject, narrow, t, details, home]);
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
            <Select value={narrow} onValueChange={setNarrow}>
              <SelectTrigger className="w-full sm:w-48" aria-label={subject === "facility" ? t("room") : t("facility")}>
                {subject === "facility" ? <DoorOpen aria-hidden /> : <Building2 aria-hidden />}
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectItem value={ALL}>{subject === "facility" ? t("allRooms") : t("allFacilities")}</SelectItem>
                  {options.map((name) => (
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
              <Button
                variant="outline"
                onClick={() => {
                  setPicked(todayAt(new Date(), timeZone));
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
              defaultMonth={shownDay ?? todayAt(new Date(), timeZone)}
              today={todayAt(new Date(), timeZone)}
            >
              {t("goTo")}
            </DatePickerButton>
            <Select value={view?.type ?? initialView} onValueChange={(next) => controller.changeView(next)}>
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
            // The free surface for the days still ahead, as on the room calendars, so the past reads apart.
            {...FREE_SURFACE}
            {...dayMarkOptions(
              (date) => localDateOf(date, timeZone) === picked,
              // The operator blocks from today on: the days before it take nothing.
              (date) => localDateOf(date, timeZone) < todayAt(new Date(), timeZone),
            )}
            plugins={plugins}
            views={{ timeGrid: EVENT_CARD_VIEW }}
            initialView={initialView}
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
            eventClick={(info) => {
              const { booking, block } = info.event.extendedProps as {
                booking?: OperatorBookingView;
                block?: PlacedBlock;
              };
              if (booking) setShown(booking);
              if (block) setShownBlock(block);
            }}
          />
        ) : (
          <Skeleton className="h-[38rem] w-full rounded-none" />
        )}
      </div>
      {canBlock ? <p className="text-muted-foreground text-sm">{t("selectHint")}</p> : null}

      {blocking ? (
        <BlockSlotDialog
          targets={targets}
          open
          onOpenChange={(open) => {
            if (open) return;
            setBlocking(null);
            // The same range as a new object reads it again, so a block just created shows at once.
            setRange((current) => (current ? { ...current } : current));
          }}
          selection={blocking.selection}
        />
      ) : null}

      <Dialog open={shownBlock !== null} onOpenChange={(open) => (open ? null : setShownBlock(null))}>
        <DialogContent>
          {shownBlock ? (
            <>
              <DialogHeader>
                <DialogTitle>{details("block")}</DialogTitle>
                <DialogDescription>{shownBlock.facilityName}</DialogDescription>
              </DialogHeader>
              <Facts
                items={[
                  { term: details("blockScope"), value: shownBlock.roomName ?? t("wholeFacility") },
                  {
                    term: home("columns.time"),
                    value: home("timeRange", {
                      start: format.dateTime(new Date(shownBlock.startsAt), "short"),
                      end: format.dateTime(new Date(shownBlock.endsAt), "short"),
                    }),
                  },
                  { term: details("blockReason"), value: shownBlock.reason },
                ]}
              />
              <DialogFooter>
                <Button asChild variant="outline">
                  <Link href={`/operador/sedes/${shownBlock.facilityId}`}>{details("manageBlocks")}</Link>
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={shown !== null} onOpenChange={(open) => (open ? null : setShown(null))}>
        <DialogContent>
          {shown ? (
            <>
              <DialogHeader>
                <DialogTitle>{shown.room.name}</DialogTitle>
                <DialogDescription>
                  {subject === "client" ? shown.room.facilityName : shown.company.name}
                </DialogDescription>
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
