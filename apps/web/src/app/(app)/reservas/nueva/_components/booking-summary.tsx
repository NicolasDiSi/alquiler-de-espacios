"use client";

import { CalendarCheck } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { type BookingChoice, ConfirmForm } from "@/components/booking/confirm-booking";
import { Badge } from "@/components/ui/badge";

/**
 * The chosen room and window, confirmed through `bookRoom` (spec 0003), so every refusal keeps its reason (spec 0008).
 * From `lg` the last card of the right column; on a phone a panel fixed at the bottom, so confirming never needs a
 * scroll. The form is keyed by the choice, so a refusal does not follow the user to another room or time. A booking
 * keeps the user here: the page data is read again and the choice cleared, so several bookings can follow.
 */
export function BookingSummary({
  choice,
  minutes,
  onBooked,
}: {
  readonly choice: BookingChoice | null;
  readonly minutes: number;
  /** After a booking: the screen clears the room, so the next one can start. */
  readonly onBooked: () => void;
}) {
  const t = useTranslations("booking.confirm");
  const format = useFormatter();
  if (!choice) {
    return (
      <p className="text-muted-foreground hidden rounded-xl border border-dashed p-5 text-sm lg:block">{t("empty")}</p>
    );
  }

  const day = format.dateTime(new Date(`${choice.date}T12:00:00Z`), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const when = t("when", { day, start: choice.start, end: choice.end, minutes });
  const place = t("place", { facility: choice.room.facility.name, capacity: choice.room.capacity });
  const key = `${choice.room.id}:${choice.date}:${choice.start}:${choice.end}`;

  return (
    <>
      <section
        aria-label={t("title")}
        className="bg-card hidden items-center gap-4 rounded-xl border p-5 shadow-sm lg:flex"
      >
        <span className="bg-primary text-primary-foreground flex size-14 shrink-0 items-center justify-center rounded-xl">
          <CalendarCheck aria-hidden className="size-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-lg font-semibold">{choice.room.name}</p>
          <p className="bg-primary/10 text-primary w-fit rounded-md px-2 py-0.5 text-sm font-medium first-letter:uppercase">
            {when}
          </p>
          <p className="text-muted-foreground text-sm">
            {place} · {t("instant")}
          </p>
        </div>
        <div className="w-56 shrink-0">
          <ConfirmForm key={key} choice={choice} onBooked={onBooked} />
        </div>
      </section>

      <section
        aria-label={t("title")}
        className="bg-card fixed inset-x-0 bottom-0 z-20 flex flex-col gap-3 rounded-t-2xl border-t p-4 shadow-[0_-8px_24px_rgb(0_0_0/0.08)] lg:hidden"
      >
        <span aria-hidden className="bg-muted mx-auto h-1 w-10 rounded-full" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">{t("title")}</p>
            <p className="font-semibold first-letter:uppercase">
              {t("line", { room: choice.room.name, day, start: choice.start, end: choice.end })}
            </p>
            <p className="text-muted-foreground text-sm">{place}</p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {t("minutes", { minutes })}
          </Badge>
        </div>
        <ConfirmForm key={key} choice={choice} onBooked={onBooked} />
        <p className="text-muted-foreground text-center text-xs">{t("cancelNote")}</p>
      </section>
    </>
  );
}
