import Link from "next/link";
import { notFound } from "next/navigation";

import { getRoomAgenda } from "@espacios/application";
import { BOOKING_DURATIONS, isBookableDay, nextOpenDay, parseLocalDate, parseTime } from "@espacios/domain";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { companyEdge } from "@/composition";
import { monthEnd, monthOf, offersStart, timeOf } from "@/lib/bookings/search";
import { requireMember } from "@/lib/session/session";

import { RoomAgendaView } from "./_components/room-agenda";
import { RoomSwitcher } from "./_components/room-switcher";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rooms.detail");
  return { title: t("title") };
}

const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

/**
 * One room for a company (spec 0008, AC-2): `?fecha&mes&duracion&inicio`, each checked against the room's sede and the
 * booking rules (a value it would not offer falls back to its default). An unknown or retired room is 404; the operator
 * gets 403.
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
  const [found, rooms] = await Promise.all([edge.rooms.findRoom(id), edge.rooms.listRooms()]);
  if (!found?.active) notFound();
  const rules = found.facility;

  const asked = parseLocalDate(single(query.fecha));
  const date = asked && isBookableDay(asked, now, rules) ? asked : nextOpenDay(now, rules);
  const month = parseLocalDate(`${single(query.mes)}-01`) ?? monthOf(date);
  const duration = Number(single(query.duracion));
  const minutes = (BOOKING_DURATIONS as readonly number[]).includes(duration) ? duration : 60;

  const agenda = await getRoomAgenda(edge, actor, { roomId: id, from: month, to: monthEnd(month), minutes });
  if (!agenda.ok) {
    if (agenda.reason === "not_found") notFound();
    throw new Error(`getRoomAgenda: ${agenda.reason}`);
  }
  const startAsked = parseTime(single(query.inicio));
  const offered = agenda.value.days.find((day) => day.date === date)?.starts ?? [];
  const start =
    startAsked !== null && offersStart(date, startAsked, minutes, rules, now) && offered.includes(startAsked)
      ? startAsked
      : null;
  const choice =
    start === null ? null : { room: agenda.value.room, date, start: timeOf(start), end: timeOf(start + minutes) };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/salas"
          className="text-muted-foreground inline-flex min-h-11 w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("detail.back")}
        </Link>
        <RoomSwitcher
          current={id}
          rooms={rooms.map((room) => ({ id: room.id, name: room.name, capacity: room.capacity }))}
        />
      </div>
      <h1 className="sr-only">{agenda.value.room.name}</h1>
      <RoomAgendaView
        room={agenda.value.room}
        agenda={agenda.value}
        state={{ date, month, minutes, start }}
        choice={choice}
      />
    </div>
  );
}
