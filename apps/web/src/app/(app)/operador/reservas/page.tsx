import { getFacilityActivity, listFacilities, listRooms, toOperatorBlockTargets } from "@espacios/application";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { operatorEdge, operatorReadEdge } from "@/composition";
import { TIME_ZONE } from "@/i18n/config";
import { PERIODOS, periodoOf } from "@/lib/operator/period";
import { requireOperator } from "@/lib/session/session";

import { ActivityCalendar } from "../_components/activity/activity-calendar";
import { ActivityCards } from "../_components/activity/activity-cards";
import { BookingHistory } from "../_components/activity/booking-history";
import { UpcomingBookings } from "../_components/activity/upcoming-bookings";
import { WeeklyPattern } from "../_components/activity/weekly-pattern";
import { PeriodPicker } from "../_components/period-picker";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator.bookings");
  return { title: t("title") };
}

/**
 * Every booking of every client and sede (feature 10): the activity screen of a sede (spec 0007) over every sede, so
 * the period in cards, the next bookings, the weekly pattern, a calendar and the history filtered by client, state and
 * text. The period is `?periodo=7d|30d|90d`. A member gets 403.
 */
export default async function OperatorBookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor } = await requireOperator();
  const [query, t, a] = await Promise.all([
    searchParams,
    getTranslations("operator.bookings"),
    getTranslations("operator.activity"),
  ]);
  const periodo = periodoOf(query.periodo);
  const edge = operatorEdge();
  const read = operatorReadEdge();

  const [activity, facilities, rooms] = await Promise.all([
    getFacilityActivity(read, actor, { facilityId: null, period: PERIODOS[periodo], timeZone: TIME_ZONE }),
    listFacilities(edge, actor, false),
    listRooms(edge, actor, { includeInactive: false }),
  ]);
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!activity.ok) throw new Error(`getFacilityActivity: ${activity.reason}`);
  if (!facilities.ok) throw new Error(`listFacilities: ${facilities.reason}`);
  if (!rooms.ok) throw new Error(`listRooms: ${rooms.reason}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <PeriodPicker path="/operador/reservas" current={periodo} range={activity.value.range} />
      <ActivityCards activity={activity.value} subject="all" />
      <UpcomingBookings
        bookings={activity.value.upcoming}
        total={activity.value.totals.upcoming}
        now={read.clock.now()}
        subject="all"
      />
      <BookingHistory bookings={activity.value.history.bookings} capped={activity.value.history.capped} subject="all" />
      <WeeklyPattern activity={activity.value} />
      <Card>
        <CardHeader>
          <CardTitle>{a("calendar.title")}</CardTitle>
          <CardDescription>{a("calendar.description.all")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityCalendar
            subject="all"
            id=""
            timeZone={TIME_ZONE}
            options={activity.value.facilities}
            targets={toOperatorBlockTargets(facilities.value, rooms.value)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
