import Link from "next/link";
import { notFound } from "next/navigation";

import { getFacilityMonth } from "@espacios/application";
import { formatTime, nextOpenDay, parseLocalDate } from "@espacios/domain";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Facts } from "@/components/facts";
import { WeekDays } from "@/components/week-days";
import { companyEdge } from "@/composition";
import { monthGrid, monthOf, readScheduleView } from "@/lib/bookings/search";
import { zoneLabel } from "@/lib/operator/format";
import { requireMember } from "@/lib/session/session";

import { RoomSchedule } from "./_components/room-schedule";
import { RoomSwitcher } from "./_components/room-switcher";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rooms.detail");
  return { title: t("title") };
}

const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

/**
 * One room for a company: its data under its name, then its bookings as a calendar by month, week or day
 * (`?fecha&vista`). The server reads the six weeks the month of `fecha` draws (a malformed day falls back to the sede's
 * next open day); a click in the calendar books through the same dialog as `/salas`. An unknown or retired room is
 * 404; the operator gets 403.
 */
export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requireMember();
  const [{ id }, query, t] = await Promise.all([params, searchParams, getTranslations("rooms")]);
  const edge = companyEdge();
  const now = edge.clock.now();
  const [room, rooms] = await Promise.all([edge.rooms.findRoom(id), edge.rooms.listRooms()]);
  if (!room?.active) notFound();
  const { facility } = room;

  const date = parseLocalDate(single(query.fecha)) ?? nextOpenDay(now, facility);
  const range = monthGrid(monthOf(date));
  const month = await getFacilityMonth(edge, actor, { facilityId: facility.id, ...range });
  if (!month.ok) {
    if (month.reason === "not_found") notFound();
    throw new Error(`getFacilityMonth: ${month.reason}`);
  }
  if (!month.value.rooms.some((item) => item.id === id)) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/salas"
          className="text-muted-foreground inline-flex min-h-11 w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("detail.back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{room.name}</h1>
          <RoomSwitcher
            current={id}
            rooms={rooms.map((item) => ({ id: item.id, name: item.name, capacity: item.capacity }))}
          />
        </div>
        <Facts
          items={[
            { term: t("detail.facts.facility"), value: facility.name },
            { term: t("detail.facts.capacity"), value: t("detail.facts.people", { count: room.capacity }) },
            {
              term: t("detail.facts.hours"),
              value: t("detail.facts.hoursValue", {
                opens: formatTime(facility.opensAt),
                closes: formatTime(facility.closesAt),
              }),
            },
            { term: t("detail.facts.days"), value: <WeekDays open={facility.openWeekdays} /> },
            { term: t("detail.facts.timeZone"), value: zoneLabel(facility.timeZone) },
          ]}
        />
      </div>
      <RoomSchedule
        roomId={id}
        month={month.value}
        initialDate={date}
        initialView={readScheduleView(query.vista)}
        now={now}
        // The calendar keeps the screen: its grid scrolls inside this height, never the page.
        className="h-[min(48rem,calc(100dvh-8rem))] min-h-[30rem]"
      />
    </div>
  );
}
