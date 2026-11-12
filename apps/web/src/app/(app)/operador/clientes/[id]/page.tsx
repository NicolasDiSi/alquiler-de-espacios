import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getClient,
  getClientActivity,
  listFacilities,
  listMembers,
  listRooms,
  toOperatorBlockTargets,
  toOperatorClientView,
  toOperatorMemberView,
} from "@espacios/application";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { operatorEdge, operatorReadEdge } from "@/composition";
import { TIME_ZONE } from "@/i18n/config";
import { PERIODOS, periodoOf } from "@/lib/operator/period";
import { requireOperator } from "@/lib/session/session";

import { Facts } from "../../_components/facts";
import { PeriodPicker } from "../../_components/period-picker";
import { RecordStatusDot } from "../../_components/status";
import { AddMemberDialog } from "../_components/add-member-dialog";
import { ClientAvatar } from "../_components/client-avatar";
import { DeactivateClientButton, ReactivateClientButton } from "../_components/client-status-buttons";
import { EditClientDialog } from "../_components/edit-client-dialog";
import { MemberList } from "../_components/member-list";
import { ActivityCards } from "./_components/activity-cards";
import { BookingHistory } from "./_components/booking-history";
import { ClientCalendar } from "./_components/client-calendar";
import { UpcomingBookings } from "./_components/upcoming-bookings";
import { WeeklyPattern } from "./_components/weekly-pattern";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator.client");
  return { title: t("detailTitle") };
}

/**
 * One client (spec 0005 data and members, spec 0007 activity): its period in cards, its next bookings, its weekly
 * pattern, a calendar of its bookings and its history. The period is `?periodo=7d|30d|90d`. The operator may block a
 * slot from the calendar, never book for the client. An unknown id is a 404; a member gets 403.
 */
export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { actor } = await requireOperator();
  const [{ id }, query, t, m, a] = await Promise.all([
    params,
    searchParams,
    getTranslations("operator.client"),
    getTranslations("operator.member"),
    getTranslations("operator.client.activity"),
  ]);
  const format = await getFormatter();
  const periodo = periodoOf(query.periodo);
  const edge = operatorEdge();
  const read = operatorReadEdge();

  const found = await getClient(edge, actor, id);
  if (!found.ok) {
    if (found.reason === "not_found") notFound();
    throw new Error(`getClient: ${found.reason}`);
  }
  const [memberRecords, activity, facilities, rooms] = await Promise.all([
    listMembers(edge, actor, id),
    getClientActivity(read, actor, { clientId: id, period: PERIODOS[periodo], timeZone: TIME_ZONE }),
    listFacilities(edge, actor, false),
    listRooms(edge, actor, { includeInactive: false }),
  ]);
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!memberRecords.ok) throw new Error(`listMembers: ${memberRecords.reason}`);
  if (!activity.ok) throw new Error(`getClientActivity: ${activity.reason}`);
  if (!facilities.ok) throw new Error(`listFacilities: ${facilities.reason}`);
  if (!rooms.ok) throw new Error(`listRooms: ${rooms.reason}`);

  const client = toOperatorClientView(found.value);
  const members = memberRecords.value.map(toOperatorMemberView);
  const targets = toOperatorBlockTargets(facilities.value, rooms.value);
  // A person who works alone holds one member; the server still refuses a second (`individual_is_single`).
  const canAddMember = client.kind === "company" || members.length === 0;
  const none = (await getTranslations("operator.dashboard"))("none");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/operador/clientes"
        className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("back")}
      </Link>

      <section className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-xs lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <ClientAvatar name={client.name} logoUrl={client.logoUrl} className="size-14 text-lg" />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <Badge variant="secondary">{t(`kinds.${client.kind}`)}</Badge>
            </div>
            <RecordStatusDot status={client.status} since={client.deactivatedAt} gender="m" />
            <Facts
              items={[
                { term: t("columns.slug"), value: client.slug },
                {
                  term: a("facts.facilities"),
                  value: activity.value.facilities.length > 0 ? activity.value.facilities.join(", ") : none,
                },
                { term: m("title"), value: members.length },
                { term: a("facts.since"), value: format.dateTime(new Date(found.value.createdAt), "long") },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <EditClientDialog client={client} />
          {client.status === "active" ? (
            <DeactivateClientButton client={client} />
          ) : (
            <ReactivateClientButton client={client} />
          )}
        </div>
      </section>

      <PeriodPicker path={`/operador/clientes/${id}`} current={periodo} range={activity.value.range} />
      <ActivityCards activity={activity.value} />

      <Tabs defaultValue="activity" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="activity">{a("tabs.activity")}</TabsTrigger>
          <TabsTrigger value="members">
            {m("title")}
            <Badge variant="secondary" className="ml-1">
              {members.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="flex flex-col gap-4">
          <UpcomingBookings
            bookings={activity.value.upcoming}
            total={activity.value.totals.upcoming}
            now={read.clock.now()}
          />
          <WeeklyPattern activity={activity.value} />
          <Card>
            <CardHeader>
              <CardTitle>{a("calendar.title")}</CardTitle>
              <CardDescription>{a("calendar.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientCalendar
                clientId={client.id}
                timeZone={TIME_ZONE}
                facilities={activity.value.facilities}
                targets={targets}
              />
            </CardContent>
          </Card>
          <BookingHistory bookings={activity.value.history.bookings} capped={activity.value.history.capped} />
        </TabsContent>

        <TabsContent value="members">
          <section aria-labelledby="members-title" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="members-title" className="text-lg font-semibold">
                {m("title")}
              </h2>
              {canAddMember ? <AddMemberDialog clientId={client.id} /> : null}
            </div>
            <MemberList members={members} />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
