"use client";

import Link from "next/link";

import { useFormatter, useTranslations } from "next-intl";

import { Facts } from "@/components/facts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** A booking of the company as a room calendar knows it: the room and the instants, in floating time (see below). */
export type MyBookingShown = { readonly room: string; readonly start: Date; readonly end: Date };

/**
 * What a click on "Tu reserva" opens on a room calendar: the room, the day, the time and the length, and the way to
 * manage it (Mis reservas, where it is cancelled). The room calendars run in floating time (the sede's wall clock
 * written as UTC), so the instants are read in UTC here. Someone else's booking and a block open nothing: a company may
 * not read more than their card already says.
 */
export function MyBookingDetails({
  shown,
  onClose,
}: {
  readonly shown: MyBookingShown | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations("calendar.details");
  const filters = useTranslations("booking.filters");
  const home = useTranslations("home");
  const format = useFormatter();
  const minutes = shown ? Math.round((shown.end.getTime() - shown.start.getTime()) / 60_000) : 0;
  const time = (value: Date) =>
    format.dateTime(value, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

  return (
    <Dialog open={shown !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        {shown ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("mine")}</DialogTitle>
              <DialogDescription className="first-letter:uppercase">
                {t("description", {
                  room: shown.room,
                  day: format.dateTime(shown.start, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  }),
                })}
              </DialogDescription>
            </DialogHeader>
            <Facts
              items={[
                { term: t("time"), value: home("timeRange", { start: time(shown.start), end: time(shown.end) }) },
                {
                  term: t("length"),
                  value: filters("minutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 }),
                },
              ]}
            />
            <DialogFooter>
              <Button asChild>
                <Link href="/?vista=proximas">{t("manage")}</Link>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
