"use client";

import Link from "next/link";

import type { FacilityMonthRoom } from "@espacios/application";
import {
  type DaySlot,
  daySlots,
  formatTime,
  isOpenWeekday,
  type LocalDate,
  type RoomNowState,
  roomNow,
  todayAt,
} from "@espacios/domain";
import { Building2, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { DayBar } from "@/components/booking/day-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MonthData } from "@/lib/bookings/month";

type Card = {
  readonly room: FacilityMonthRoom;
  readonly open: boolean;
  readonly slots: readonly DaySlot[];
  readonly free: number;
  /** The room right now, only when the day is today. */
  readonly now: { readonly state: RoomNowState; readonly until: number | null } | null;
};

/** How a room reads on the day, in words; the badge color only reinforces them. */
function StateBadge({ card }: { readonly card: Card }) {
  const t = useTranslations("rooms");
  if (!card.open) return <Badge variant="outline">{t("now.closedDay")}</Badge>;
  const now = card.now;
  if (!now) {
    return card.free > 0 ? (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
        {t("cards.free", { count: card.free })}
      </Badge>
    ) : (
      <Badge variant="secondary">{t("cards.full")}</Badge>
    );
  }
  const until = now.until === null ? "" : formatTime(now.until);
  if (now.state === "free") {
    return (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
        <span aria-hidden className="bg-success size-1.5 rounded-full" />
        {t("now.free")}
      </Badge>
    );
  }
  if (now.state === "busy") {
    return (
      <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
        <span aria-hidden className="bg-warning size-1.5 rounded-full" />
        {t("now.busyUntil", { time: until })}
      </Badge>
    );
  }
  if (now.state === "blocked") return <Badge variant="secondary">{t("now.blockedUntil", { time: until })}</Badge>;
  return <Badge variant="outline">{t("now.closedNow")}</Badge>;
}

/**
 * The rooms as cards (spec 0008's grid, kept in spec 0009 as the other view of `/salas`): one card per room with its
 * state (now, when the day is today), the day as a bar and a way to book it. The whole card opens the room's detail.
 * The rooms arrive filtered by the page's one search and filter panel, the same ones the calendar view reads.
 */
export function RoomCards({
  month,
  rooms,
  day,
  now,
}: {
  readonly month: MonthData;
  readonly rooms: readonly FacilityMonthRoom[];
  readonly day: LocalDate;
  readonly now: Date;
}) {
  const t = useTranslations("rooms");
  const { facility } = month;
  const today = todayAt(now, facility.timeZone) === day;

  const cards: Card[] = rooms.map((room) => {
    const busy = month.busyByRoom.get(room.id) ?? [];
    const slots = daySlots(day, facility, busy, now);
    return {
      room,
      open: isOpenWeekday(day, facility),
      slots,
      free: slots.filter((slot) => slot.state === "free").length,
      now: today ? roomNow(facility, busy, now) : null,
    };
  });
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <li
          key={card.room.id}
          className="bg-card hover:border-primary/50 relative flex flex-col rounded-xl border shadow-xs transition-colors"
        >
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">
                  {/* The link covers the whole card, so the card is the target; "Reservar" sits above it. */}
                  <Link
                    href={`/salas/${card.room.id}?fecha=${day}`}
                    className="after:absolute after:inset-0 after:rounded-xl focus-visible:underline focus-visible:outline-none"
                  >
                    {card.room.name}
                  </Link>
                </h2>
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Building2 aria-hidden className="size-3.5" />
                  {facility.name}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                <Users aria-hidden />
                {t("capacity", { count: card.room.capacity })}
              </Badge>
            </div>
            <div>
              <StateBadge card={card} />
            </div>
            {card.slots.length > 0 ? (
              <DayBar
                room={card.room.name}
                slots={card.slots}
                opensAt={facility.opensAt}
                closesAt={facility.closesAt}
                window={null}
                selected={false}
              />
            ) : null}
          </div>
          {card.free > 0 ? (
            <div className="relative z-10 flex border-t p-3">
              <Button asChild className="h-11 flex-1">
                <Link href={`/reservas/nueva?sala=${card.room.id}&fecha=${day}`}>
                  <Plus aria-hidden />
                  {t("actions.book")}
                </Link>
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
