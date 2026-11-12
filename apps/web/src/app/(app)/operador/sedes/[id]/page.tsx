import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getFacility,
  getFacilityActivity,
  listBlocks,
  listRooms,
  toOperatorBlockTargets,
  toOperatorBlockViews,
  toOperatorFacilityView,
  toOperatorRoomView,
  toOperatorWeekView,
} from "@espacios/application";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { operatorEdge, operatorReadEdge } from "@/composition";
import { zoneLabel } from "@/lib/operator/format";
import { PERIODOS, periodoOf } from "@/lib/operator/period";
import { requireOperator } from "@/lib/session/session";

import { ActivityCalendar } from "../../_components/activity/activity-calendar";
import { ActivityCards } from "../../_components/activity/activity-cards";
import { BookingHistory } from "../../_components/activity/booking-history";
import { UpcomingBookings } from "../../_components/activity/upcoming-bookings";
import { WeeklyPattern } from "../../_components/activity/weekly-pattern";
import { Facts } from "../../_components/facts";
import { PeriodPicker } from "../../_components/period-picker";
import { SectionEmpty } from "../../_components/section-empty";
import { RecordStatusDot } from "../../_components/status";
import { DeactivateFacilityButton } from "../_components/deactivate-facility-button";
import { EditFacilityDialog } from "../_components/edit-facility-dialog";
import { WeekDays } from "../_components/week-days";
import { BlockList } from "./_components/block-list";
import { CreateBlockDialog } from "./_components/create-block-dialog";
import { CreateRoomDialog } from "./_components/create-room-dialog";
import { RoomList } from "./_components/room-list";
import { WeekStrip } from "./_components/week-strip";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator.facility");
  return { title: t("detailTitle") };
}

/**
 * One sede (spec 0005, AC-5): its data, then the same activity screen as a client's (spec 0007) over the sede's rooms,
 * every client together: the period in cards, its next bookings, its weekly pattern, a calendar and its history. Its
 * rooms and blocks are the other two tabs. The period is `?periodo=7d|30d|90d`, read in the sede's zone. A retired sede
 * shows its history read only. An unknown id is a 404.
 */
export default async function FacilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { actor } = await requireOperator();
  const [{ id }, query, t, rooms, blocks, a] = await Promise.all([
    params,
    searchParams,
    getTranslations("operator.facility"),
    getTranslations("operator.room"),
    getTranslations("operator.block"),
    getTranslations("operator.activity"),
  ]);
  const periodo = periodoOf(query.periodo);
  const edge = operatorEdge();
  const read = operatorReadEdge();

  const found = await getFacility(edge, actor, id);
  if (!found.ok) {
    if (found.reason === "not_found") notFound();
    throw new Error(`getFacility: ${found.reason}`);
  }
  const record = found.value;
  const [roomRecords, blockRecords, activity] = await Promise.all([
    listRooms(edge, actor, { facilityId: id, includeInactive: true }),
    listBlocks(edge, actor, { facilityId: id, includeReleased: true }),
    getFacilityActivity(read, actor, { facilityId: id, period: PERIODOS[periodo], timeZone: record.timeZone }),
  ]);
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!roomRecords.ok) throw new Error(`listRooms: ${roomRecords.reason}`);
  if (!blockRecords.ok) throw new Error(`listBlocks: ${blockRecords.reason}`);
  if (!activity.ok) throw new Error(`getFacilityActivity: ${activity.reason}`);

  const roomViews = roomRecords.value.map((room) => toOperatorRoomView(room, record.timeZone));
  const facility = toOperatorFacilityView(record, roomViews.filter((room) => room.status === "active").length);
  const now = edge.clock.now();
  const blockViews = toOperatorBlockViews(blockRecords.value, roomRecords.value, record.timeZone, now);
  const week = toOperatorWeekView(record, blockRecords.value, roomRecords.value, now);
  const active = facility.status === "active";
  // The calendar blocks only in this sede, and only while it is open; it filters by every room that may hold a booking.
  const targets = toOperatorBlockTargets([record], roomRecords.value);
  const roomNames = [...new Set(roomViews.map((room) => room.name))].sort((x, y) => x.localeCompare(y));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/operador/sedes"
          className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{facility.name}</h1>
            <RecordStatusDot status={facility.status} since={facility.deactivatedAt} gender="f" />
          </div>
          {active ? (
            <div className="flex flex-wrap items-start gap-2">
              <EditFacilityDialog facility={facility} />
              <DeactivateFacilityButton facility={facility} />
            </div>
          ) : null}
        </div>
        <Facts
          items={[
            { term: t("columns.address"), value: facility.address ?? t("noAddress") },
            { term: t("columns.timeZone"), value: zoneLabel(facility.timeZone) },
            { term: t("columns.hours"), value: t("hours", { from: facility.opensAt, to: facility.closesAt }) },
            { term: t("columns.days"), value: <WeekDays open={facility.openWeekdays} /> },
            { term: t("columns.rooms"), value: facility.activeRooms },
          ]}
        />
      </div>

      <PeriodPicker path={`/operador/sedes/${id}`} current={periodo} range={activity.value.range} />
      <ActivityCards activity={activity.value} subject="facility" />

      <Tabs defaultValue="activity" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="activity">{a("tabs.activity")}</TabsTrigger>
          <TabsTrigger value="rooms">
            {rooms("title")}
            <Badge variant="secondary" className="ml-1">
              {roomViews.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="blocks">
            {blocks("title")}
            <Badge variant="secondary" className="ml-1">
              {blockViews.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="flex flex-col gap-4">
          <UpcomingBookings
            bookings={activity.value.upcoming}
            total={activity.value.totals.upcoming}
            now={read.clock.now()}
            subject="facility"
          />
          <WeeklyPattern activity={activity.value} />
          <Card>
            <CardHeader>
              <CardTitle>{a("calendar.title")}</CardTitle>
              <CardDescription>{a("calendar.description.facility")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityCalendar
                subject="facility"
                id={facility.id}
                timeZone={facility.timeZone}
                options={roomNames}
                targets={targets}
              />
            </CardContent>
          </Card>
          <BookingHistory
            bookings={activity.value.history.bookings}
            capped={activity.value.history.capped}
            subject="facility"
          />
        </TabsContent>

        <TabsContent value="rooms">
          <section aria-labelledby="rooms-title" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="rooms-title" className="text-lg font-semibold">
                {rooms("title")}
              </h2>
              {active ? <CreateRoomDialog facilityId={facility.id} timeZone={facility.timeZone} /> : null}
            </div>
            {roomViews.length === 0 ? (
              <SectionEmpty>{active ? rooms("empty") : rooms("emptyRetired")}</SectionEmpty>
            ) : (
              <RoomList facility={facility} rooms={roomViews} />
            )}
          </section>
        </TabsContent>

        <TabsContent value="blocks" className="flex flex-col gap-4">
          {active ? <WeekStrip week={week} timeZone={zoneLabel(facility.timeZone)} /> : null}

          <section aria-labelledby="blocks-title" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="blocks-title" className="text-lg font-semibold">
                {blocks("title")}
              </h2>
              {active ? (
                <CreateBlockDialog facility={facility} rooms={roomViews.filter((room) => room.status === "active")} />
              ) : null}
            </div>
            {blockViews.length === 0 ? (
              <SectionEmpty>{active ? blocks("empty") : blocks("emptyRetired")}</SectionEmpty>
            ) : (
              <BlockList facility={facility} blocks={blockViews} />
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
