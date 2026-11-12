"use client";

import type { FacilityRules } from "@espacios/domain";
import { cn } from "cn";
import { CalendarSearch, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { DayBar, SLOT_FILL } from "@/components/booking/day-bar";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { RoomOnDay } from "@/lib/bookings/month";
import { timeOf } from "@/lib/bookings/search";

type Window = { readonly start: number; readonly end: number };

/** What the room's row says about the window: free until when, or busy and free again when. Never whose booking. */
function statusOf(item: RoomOnDay, t: ReturnType<typeof useTranslations<"booking.rooms">>): string | null {
  const fit = item.fit;
  if (!fit) return null;
  if (fit.state === "free")
    return fit.nextBusy === null ? t("freeUntilClose") : t("nextBooking", { time: timeOf(fit.nextBusy) });
  return fit.freeFrom === null ? t("busyUntilClose") : t("freeFrom", { time: timeOf(fit.freeFrom) });
}

function HoursAxis({ facility, window }: { readonly facility: FacilityRules; readonly window: Window | null }) {
  const hours: number[] = [];
  for (let minutes = facility.opensAt; minutes <= facility.closesAt; minutes += 120) {
    // An hour too close to the chosen start would print over it.
    if (!window || Math.abs(minutes - window.start) > 60) hours.push(minutes);
  }
  const span = Math.max(1, facility.closesAt - facility.opensAt);
  return (
    <div aria-hidden className="text-muted-foreground relative hidden h-5 text-xs tabular-nums lg:block">
      {hours.map((minutes) => (
        <span
          key={minutes}
          className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
          style={{ left: `${((minutes - facility.opensAt) / span) * 100}%` }}
        >
          {timeOf(minutes)}
        </span>
      ))}
      {window ? (
        <span
          className="text-primary bg-card absolute -translate-x-1/2 px-1 font-semibold"
          style={{ left: `${((window.start - facility.opensAt) / span) * 100}%` }}
        >
          {timeOf(window.start)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Every room of the sede with room for the people, over the chosen day (spec 0008): each one a card with its day as a
 * bar and the chosen window marked on it. With a start chosen, the free rooms are one choice (the whole card is the
 * target, the smallest is recommended) and the busy ones follow, unless "solo libres" hides them.
 */
export function RoomChoices({
  rooms,
  window,
  people,
  facility,
  selectedId,
  onlyFree,
  onSelect,
}: {
  readonly rooms: readonly RoomOnDay[];
  readonly window: Window | null;
  readonly people: number;
  readonly facility: FacilityRules;
  readonly selectedId: string | null;
  readonly onlyFree: boolean;
  readonly onSelect: (roomId: string) => void;
}) {
  const t = useTranslations("booking.rooms");
  const bar = useTranslations("booking.bar");
  const legend = useTranslations("booking.timeline.legend");
  const free = rooms.filter((item) => item.fit?.state === "free");
  const shown =
    window && onlyFree ? rooms.filter((item) => item.fit?.state === "free" || item.room.id === selectedId) : rooms;
  const recommended = free[0]?.room.id;

  return (
    <section
      aria-labelledby="rooms-step"
      className="lg:bg-card flex flex-col gap-3 lg:rounded-xl lg:border lg:p-5 lg:shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 lg:border-b lg:pb-3">
        <div className="min-w-0">
          <h2
            id="rooms-step"
            className="text-muted-foreground lg:text-foreground text-sm font-semibold tracking-wide uppercase lg:text-lg lg:tracking-tight lg:normal-case"
          >
            <span className="lg:hidden">{t("step")}</span>
            <span className="hidden lg:inline">{t("titleAll")}</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            {window
              ? t("window", { start: timeOf(window.start), end: timeOf(window.end), people })
              : t("pickDescription")}
          </p>
        </div>
        {window ? (
          <Badge variant="outline" className="border-success/40 text-success lg:hidden">
            {t("available", { count: free.length })}
          </Badge>
        ) : null}
        <ul className="text-muted-foreground hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs lg:flex">
          {(["free", "booked", "mine", "blocked"] as const).map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-3 rounded-sm", SLOT_FILL[state])} />
              {legend(state)}
            </li>
          ))}
          {window ? (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="bg-primary size-3 rounded-sm" />
              {bar("selection", { start: timeOf(window.start), end: timeOf(window.end) })}
            </li>
          ) : null}
        </ul>
      </div>

      {rooms.length === 0 ? (
        <Empty className="border p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarSearch aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t("titleDay")}</EmptyTitle>
            <EmptyDescription>{t("none", { people })}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden lg:grid lg:grid-cols-[16rem_1fr] lg:gap-4">
            <span />
            <HoursAxis facility={facility} window={window} />
          </div>
          <RadioGroup
            aria-label={t("label")}
            value={selectedId ?? ""}
            onValueChange={onSelect}
            className="flex flex-col gap-3"
          >
            {shown.map((item) => {
              const id = `room-choice-${item.room.id}`;
              const isFree = item.fit?.state === "free";
              const selected = item.room.id === selectedId;
              const status = statusOf(item, t);
              return (
                <label
                  key={item.room.id}
                  htmlFor={id}
                  className={cn(
                    "bg-card grid gap-3 rounded-xl border p-4 transition-colors lg:grid-cols-[16rem_1fr] lg:items-center lg:gap-4",
                    isFree ? "hover:border-primary/50 cursor-pointer" : "opacity-70",
                    selected && "border-primary ring-primary/20 ring-2",
                  )}
                >
                  <span className="flex items-start gap-3">
                    <RadioGroupItem id={id} value={item.room.id} disabled={!isFree} className="mt-1 size-5" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.room.name}</span>
                        {item.room.id === recommended ? (
                          <Badge variant="secondary" className="bg-info/15 text-info">
                            {t("recommended")}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground hidden items-center gap-1 text-xs lg:flex">
                        <Users aria-hidden className="size-3.5" />
                        {t("capacity", { count: item.room.capacity })}
                      </span>
                      {status ? (
                        <span className={cn("text-xs", isFree ? "text-success" : "text-muted-foreground")}>
                          {status}
                        </span>
                      ) : null}
                    </span>
                    <Badge variant="outline" className="shrink-0 lg:hidden">
                      <Users aria-hidden />
                      {item.room.capacity}
                    </Badge>
                  </span>
                  <span className="flex flex-col gap-1">
                    <span
                      aria-hidden
                      className="text-muted-foreground flex justify-between text-xs tabular-nums lg:hidden"
                    >
                      <span>{timeOf(facility.opensAt)}</span>
                      {window ? <span className="text-primary font-semibold">{timeOf(window.start)}</span> : null}
                      <span>{timeOf(facility.closesAt)}</span>
                    </span>
                    <DayBar
                      room={item.room.name}
                      slots={item.slots}
                      opensAt={facility.opensAt}
                      closesAt={facility.closesAt}
                      window={window}
                      selected={selected}
                    />
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        </>
      )}
    </section>
  );
}
