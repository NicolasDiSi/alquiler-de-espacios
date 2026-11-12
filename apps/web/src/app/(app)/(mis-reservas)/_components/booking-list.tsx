"use client";

import { useState } from "react";

import type { BookingView, MyBookingsView } from "@espacios/application";
import type { BookingPhase } from "@espacios/domain";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { CancelBookingButton } from "./cancel-booking-button";

/** Text carries the state; the badge style only reinforces it (never color alone). */
const PHASE_VARIANT: Record<BookingPhase, "secondary" | "outline"> = {
  upcoming: "outline",
  in_progress: "secondary",
  finished: "outline",
  cancelled: "outline",
};

type Page = { readonly bookings: readonly BookingView[]; readonly nextCursor: string | null };

type LoadState = "idle" | "loading" | "failed";

export type BookingListProps = {
  readonly view: MyBookingsView;
  readonly initial: Page;
  /** The booking the `bookRoom` action just created, marked "Nueva" when it is on this page. */
  readonly newId: string | null;
};

/**
 * One view of Mis reservas (spec 0003): a native table on wide screens, a list of cards below `md`. "Ver más" loads
 * the next 50 through `GET /api/v1/bookings`; a failed load keeps the rows already shown and offers a retry.
 */
export function BookingList({ view, initial, newId }: BookingListProps) {
  const t = useTranslations("home");
  const format = useFormatter();
  const [bookings, setBookings] = useState(initial.bookings);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [load, setLoad] = useState<LoadState>("idle");
  const [announcement, setAnnouncement] = useState("");

  const loadMore = async () => {
    if (!cursor) return;
    setLoad("loading");
    try {
      const response = await fetch(`/api/v1/bookings?view=${view}&cursor=${encodeURIComponent(cursor)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`GET /api/v1/bookings answered ${response.status}`);
      const page = (await response.json()) as Page;
      setBookings((current) => [...current, ...page.bookings]);
      setCursor(page.nextCursor);
      setAnnouncement(t("loaded", { count: page.bookings.length }));
      setLoad("idle");
    } catch {
      setLoad("failed");
    }
  };

  const details = (booking: BookingView) => {
    const startsAt = new Date(booking.startsAt);
    return {
      date: format.dateTime(startsAt, "short"),
      time: t("timeRange", {
        start: format.dateTime(startsAt, "time"),
        end: format.dateTime(new Date(booking.endsAt), "time"),
      }),
      createdAt: format.dateTime(new Date(booking.createdAt), "dateTime"),
      cancelledAt: booking.cancelledAt ? format.dateTime(new Date(booking.cancelledAt), "dateTime") : null,
    };
  };

  /** A confirmed booking that has not started can be cancelled; the server decides again on every attempt. */
  const dropRow = (id: string) => setBookings((current) => current.filter((booking) => booking.id !== id));
  const action = (booking: BookingView) =>
    booking.phase === "upcoming" ? (
      <CancelBookingButton
        booking={booking}
        summary={{ room: booking.room.name, date: details(booking).date, time: details(booking).time }}
        onGone={dropRow}
      />
    ) : null;

  const status = (booking: BookingView) => (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant={PHASE_VARIANT[booking.phase]}>{t(`phase.${booking.phase}`)}</Badge>
      {booking.id === newId ? <Badge>{t("newBadge")}</Badge> : null}
    </span>
  );

  const showCancelledAt = view === "cancelled";
  const showActions = view === "upcoming";

  /** Below the list: the retry after a failed load, "Ver más" while there is more, or the sentence that says it ended. */
  const footer = () => {
    if (load === "failed") {
      return (
        <div role="alert" className="text-destructive flex flex-wrap items-center gap-2 text-sm">
          <span>{t("loadError")}</span>
          <Button type="button" variant="outline" size="sm" onClick={loadMore}>
            {t("retry")}
          </Button>
        </div>
      );
    }
    if (cursor) {
      return (
        <Button type="button" variant="outline" onClick={loadMore} disabled={load === "loading"}>
          {load === "loading" ? t("loadingMore") : t("loadMore")}
        </Button>
      );
    }
    return <p className="text-muted-foreground text-sm">{t("noMore")}</p>;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card hidden rounded-lg border shadow-sm md:block">
        <Table>
          <TableCaption className="sr-only">{t(`captions.${view}`)}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.room")}</TableHead>
              <TableHead scope="col">{t("columns.date")}</TableHead>
              <TableHead scope="col">{t("columns.time")}</TableHead>
              <TableHead scope="col">{t("columns.bookedBy")}</TableHead>
              <TableHead scope="col">{t("columns.status")}</TableHead>
              <TableHead scope="col">{t("columns.createdAt")}</TableHead>
              {showCancelledAt ? <TableHead scope="col">{t("columns.cancelledAt")}</TableHead> : null}
              {showActions ? (
                <TableHead scope="col">
                  <span className="sr-only">{t("columns.actions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => {
              const shown = details(booking);
              return (
                <TableRow key={booking.id}>
                  <TableCell className="font-medium">{booking.room.name}</TableCell>
                  <TableCell>{shown.date}</TableCell>
                  <TableCell>{shown.time}</TableCell>
                  <TableCell>{booking.bookedBy.name}</TableCell>
                  <TableCell>{status(booking)}</TableCell>
                  <TableCell>{shown.createdAt}</TableCell>
                  {showCancelledAt ? <TableCell>{shown.cancelledAt}</TableCell> : null}
                  {showActions ? <TableCell className="text-right">{action(booking)}</TableCell> : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden" aria-label={t(`captions.${view}`)}>
        {bookings.map((booking) => {
          const shown = details(booking);
          return (
            <li key={booking.id} className="bg-card flex flex-col gap-2 rounded-lg border p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{booking.room.name}</p>
                  <p>{t("dateAndTime", { date: shown.date, time: shown.time })}</p>
                </div>
                {status(booking)}
              </div>
              <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt>{t("columns.bookedBy")}</dt>
                <dd>{booking.bookedBy.name}</dd>
                <dt>{t("columns.createdAt")}</dt>
                <dd>{shown.createdAt}</dd>
                {showCancelledAt ? (
                  <>
                    <dt>{t("columns.cancelledAt")}</dt>
                    <dd>{shown.cancelledAt}</dd>
                  </>
                ) : null}
              </dl>
              {action(booking) ? <div className="flex justify-end">{action(booking)}</div> : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col items-start gap-2">
        {footer()}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
    </div>
  );
}
