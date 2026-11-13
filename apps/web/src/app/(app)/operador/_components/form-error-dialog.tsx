"use client";

import Link from "next/link";

import type { AffectedBooking, RefusalDetails } from "@espacios/domain";
import { UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  AdaptiveAlertDialog,
  AdaptiveAlertDialogBody,
  AdaptiveAlertDialogCancel,
  AdaptiveAlertDialogContent,
  AdaptiveAlertDialogDescription,
  AdaptiveAlertDialogFooter,
  AdaptiveAlertDialogHeader,
  AdaptiveAlertDialogTitle,
} from "@/components/adaptive-alert-dialog";
import { Button } from "@/components/ui/button";
import { formats } from "@/i18n/config";
import type { ActionResult } from "@/lib/result/action-result";

type Failure = Extract<ActionResult<unknown>, { ok: false }>;
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
 * A refusal no field can hold, in an adaptive alert dialog on top of the form that was refused: the form keeps what
 * was typed underneath, and this one says why and offers the way forward the reason has. It has to be answered (an
 * alert dialog never closes on a click outside), takes the focus and is read out, so nothing of the form's space goes
 * to it. When bookings are in the way (spec 0005, AC-4) it lists them by client, with each client's page to contact
 * them. The header and footer stay put and only the body scrolls, however long the list.
 */
export function FormErrorDialog({
  open,
  onOpenChange,
  failure,
  timeZone,
  onRetry,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly failure: Failure;
  /** The sede's zone: the bookings in the way are read on its clock. */
  readonly timeZone: string;
  /** Sends the form again, for a refusal that may pass on a second try (`busy`). */
  readonly onRetry: () => void;
}) {
  const t = useTranslations("operator.form");
  const refusal = useTranslations("operator.refusal");
  const { details } = failure;

  return (
    <AdaptiveAlertDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveAlertDialogContent className="md:max-w-lg" data-testid="form-error-dialog">
        <AdaptiveAlertDialogHeader>
          <AdaptiveAlertDialogTitle>
            {details ? refusal("title", { total: details.total }) : t("errorTitle")}
          </AdaptiveAlertDialogTitle>
          <AdaptiveAlertDialogDescription>{failure.message}</AdaptiveAlertDialogDescription>
        </AdaptiveAlertDialogHeader>

        {details ? <BookingsInTheWay details={details} timeZone={timeZone} /> : null}

        <AdaptiveAlertDialogFooter>
          {failure.reason === "unauthenticated" ? (
            <Button asChild variant="outline">
              <Link href="/ingresar">{t("signInAgain")}</Link>
            </Button>
          ) : null}
          {failure.reason === "busy" ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              {t("retry")}
            </Button>
          ) : null}
          <AdaptiveAlertDialogCancel variant="default">
            {details ? refusal("back") : t("understood")}
          </AdaptiveAlertDialogCancel>
        </AdaptiveAlertDialogFooter>
      </AdaptiveAlertDialogContent>
    </AdaptiveAlertDialog>
  );
}

function BookingsInTheWay({ details, timeZone }: { readonly details: RefusalDetails; readonly timeZone: string }) {
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
