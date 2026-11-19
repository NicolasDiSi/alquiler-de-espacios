"use client";

import Link from "next/link";

import type { AffectedBooking, RefusalDetails } from "@espacios/domain";
import { UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { AdaptiveAlertDialogBody } from "@/components/adaptive-alert-dialog";
import { Button } from "@/components/ui/button";
import { formats } from "@/i18n/config";

type Client = { readonly id: string; readonly name: string; readonly bookings: AffectedBooking[] };

/** The bookings by client, in the order the first booking of each starts (the use case sends them by start). */
function byClient(bookings: readonly AffectedBooking[]): Client[] {
  const clients = new Map<string, Client>();
  for (const booking of bookings) {
    const client = clients.get(booking.companyId);
    if (client) client.bookings.push(booking);
    else clients.set(booking.companyId, { id: booking.companyId, name: booking.companyName, bookings: [booking] });
  }
  return [...clients.values()];
}

/**
 * The confirmed bookings in the way of an operator change (spec 0005, AC-4), as the body of the `ErrorDialog` on top of
 * the refused form: grouped by client, each with its page to contact them. A block, a room's retirement and a sede's
 * new hours share it. Only this body scrolls, however long the list.
 */
export function BookingsInTheWay({
  details,
  timeZone,
}: {
  readonly details: RefusalDetails;
  readonly timeZone: string;
}) {
  const t = useTranslations("operator.refusal");
  const format = useFormatter();
  const day = (value: Date) =>
    format.dateTime(new Date(value), { weekday: "short", day: "numeric", month: "short", timeZone });
  const time = (value: Date) => format.dateTime(new Date(value), { ...formats.dateTime.time, timeZone });
  const hidden = details.total - details.bookings.length;

  return (
    <AdaptiveAlertDialogBody className="flex flex-col gap-3">
      {byClient(details.bookings).map((client) => (
        <section
          key={client.id}
          aria-label={t("clientLabel", { client: client.name })}
          className="border-destructive/30 border-s-destructive rounded-lg border border-s-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{client.name}</span>
              <span className="text-muted-foreground text-xs">
                {t("clientCount", { count: client.bookings.length })}
              </span>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/operador/clientes/${client.id}`}>
                <UserRound aria-hidden />
                {t("contact")}
              </Link>
            </Button>
          </div>
          <ul className="divide-y text-sm">
            {client.bookings.map((booking) => (
              <li key={booking.id} className="grid grid-cols-[minmax(0,7rem)_auto_minmax(0,1fr)] gap-3 px-3 py-2">
                <span className="first-letter:uppercase">{day(booking.startsAt)}</span>
                <span className="tabular-nums">
                  {t("range", { from: time(booking.startsAt), to: time(booking.endsAt) })}
                </span>
                <span className="text-muted-foreground truncate text-end">{booking.roomName}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hidden > 0 ? <p className="text-muted-foreground text-xs">{t("more", { count: hidden })}</p> : null}
    </AdaptiveAlertDialogBody>
  );
}
