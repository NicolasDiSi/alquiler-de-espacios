import type { OperatorBookingView } from "@espacios/application";
import { addDays, localDateOf, todayAt } from "@espacios/domain";
import { cn } from "cn";
import { Building, CalendarClock, DoorOpen } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TIME_ZONE } from "@/i18n/config";

import { StatusDot } from "../status";
import type { ActivitySubject } from "./subject";

/**
 * The next confirmed bookings of a client or a sede as cards (spec 0007): when (today, tomorrow or the day), where and
 * who booked it. A booking has no subject, so the room heads the card; under it the sede for a client, the client for a
 * sede.
 */
export async function UpcomingBookings({
  bookings,
  total,
  now,
  subject,
}: {
  readonly bookings: readonly OperatorBookingView[];
  /** Every confirmed booking still to come, beyond the ones shown. */
  readonly total: number;
  readonly now: Date;
  readonly subject: ActivitySubject;
}) {
  const t = await getTranslations("operator.activity.upcoming");
  const home = await getTranslations("home");
  const format = await getFormatter();
  const today = todayAt(now, TIME_ZONE);

  const dayOf = (startsAt: string) => {
    const day = localDateOf(new Date(startsAt), TIME_ZONE);
    if (day === today) return t("today");
    if (day === addDays(today, 1)) return t("tomorrow");
    return format.dateTime(new Date(startsAt), { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <CalendarClock aria-hidden className="text-muted-foreground size-4" />
          {t("title")}
          <Badge variant="secondary">{t("count", { count: total })}</Badge>
        </CardTitle>
        <CardDescription>{t(`description.${subject}`)}</CardDescription>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t(`empty.${subject}`)}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {bookings.map((booking, index) => (
              <li
                key={booking.id}
                className={cn(
                  "bg-card flex flex-col gap-3 rounded-lg border border-l-4 p-3",
                  index === 0 ? "border-l-primary" : "border-l-muted-foreground/40",
                )}
              >
                <p
                  className={cn(
                    "w-fit rounded-sm px-2 py-0.5 text-xs font-medium",
                    index === 0 ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {home("dateAndTime", {
                    date: dayOf(booking.startsAt),
                    time: home("timeRange", {
                      start: format.dateTime(new Date(booking.startsAt), "time"),
                      end: format.dateTime(new Date(booking.endsAt), "time"),
                    }),
                  })}
                </p>
                <div className="space-y-0.5">
                  <p className="font-medium">{booking.room.name}</p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    {subject === "client" ? (
                      <DoorOpen aria-hidden className="size-3.5" />
                    ) : (
                      <Building aria-hidden className="size-3.5" />
                    )}
                    {subject === "client" ? booking.room.facilityName : booking.company.name}
                  </p>
                </div>
                <dl className="bg-muted/40 mt-auto flex flex-col gap-1 rounded-md p-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{home("columns.bookedBy")}</dt>
                    <dd>{booking.bookedBy.name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{home("columns.status")}</dt>
                    <dd>
                      <StatusDot tone={booking.phase === "in_progress" ? "info" : "success"}>
                        {home(`phase.${booking.phase}`)}
                      </StatusDot>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
