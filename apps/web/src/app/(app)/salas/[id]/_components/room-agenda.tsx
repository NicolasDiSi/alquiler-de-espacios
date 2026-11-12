"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import type { AvailabilityRoom, RoomAgenda } from "@espacios/application";
import { BOOKING_DURATIONS, type LocalDate } from "@espacios/domain";
import { cn } from "cn";
import { Building2, Clock, Globe, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { AvailabilityCalendar } from "@/components/booking/availability-calendar";
import { type BookingChoice, ConfirmBooking } from "@/components/booking/confirm-booking";
import { TimeSlots } from "@/components/booking/time-slots";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { monthOf, timeOf } from "@/lib/bookings/search";
import { zoneLabel } from "@/lib/operator/format";

type State = {
  readonly date: LocalDate;
  readonly month: LocalDate;
  readonly minutes: number;
  readonly start: number | null;
};

/**
 * One room, as the engineer's reference scheduler (spec 0008): the room and the search on the left, the month with the
 * days that have room in the middle, the day's free starts on the right, and the confirmation. Every change is a URL
 * the server answers; only "Confirmar reserva" books.
 */
export function RoomAgendaView({
  room,
  agenda,
  state,
  choice,
}: {
  readonly room: AvailabilityRoom;
  readonly agenda: RoomAgenda;
  readonly state: State;
  readonly choice: BookingChoice | null;
}) {
  const t = useTranslations("booking");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (patch: Partial<State>) => {
    const next = { ...state, ...patch };
    // A new day or duration starts the time again; a new day also shows its month.
    const start = "date" in patch || "minutes" in patch ? (patch.start ?? null) : next.start;
    const month = patch.date && !patch.month ? monthOf(patch.date) : next.month;
    const params = new URLSearchParams({ fecha: next.date, mes: month.slice(0, 7), duracion: String(next.minutes) });
    if (start !== null) params.set("inicio", timeOf(start));
    startTransition(() => router.replace(`/salas/${room.id}?${params}`, { scroll: false }));
  };
  const day = agenda.days.find((item) => item.date === state.date);
  const dayName = format.dateTime(new Date(`${state.date}T12:00:00Z`), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <div
      className={cn("flex flex-col gap-4 pb-24 transition-opacity lg:pb-0", pending && "opacity-60")}
      aria-busy={pending}
    >
      <div className="grid gap-4 lg:grid-cols-[17rem_1fr] xl:grid-cols-[17rem_1fr_16rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{room.name}</CardTitle>
            <CardDescription className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5">
                <Building2 aria-hidden className="size-4" />
                {room.facility.name}
              </span>
              <span className="flex items-center gap-1.5">
                <Users aria-hidden className="size-4" />
                {t("room.capacity", { count: room.capacity })}
              </span>
              <span className="flex items-center gap-1.5">
                <Globe aria-hidden className="size-4" />
                {t("filters.zone", {
                  zone: zoneLabel(room.facility.timeZone),
                  opens: room.facility.opensAt,
                  closes: room.facility.closesAt,
                })}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-5">
              <FieldSeparator />
              <Field>
                <FieldLabel id="room-duration">{t("filters.duration")}</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={2}
                  aria-labelledby="room-duration"
                  value={String(state.minutes)}
                  onValueChange={(next) => (next ? go({ minutes: Number(next) }) : null)}
                  className="grid w-full grid-cols-3"
                >
                  {BOOKING_DURATIONS.map((minutes) => (
                    <ToggleGroupItem
                      key={minutes}
                      value={String(minutes)}
                      className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11"
                    >
                      {t("filters.minutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <FieldSeparator />
              <FieldDescription>{t("filters.rules")}</FieldDescription>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("calendar.title")}</CardTitle>
            <CardDescription>{t("calendar.descriptionRoom")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AvailabilityCalendar
              month={state.month}
              selected={state.date}
              available={agenda.days.filter((item) => item.starts.length > 0).map((item) => item.date)}
              onSelect={(date) => go({ date })}
              onMonthChange={(month) => go({ month })}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle className="first-letter:uppercase">{dayName}</CardTitle>
            <CardDescription>{t("times.description", { minutes: state.minutes })}</CardDescription>
          </CardHeader>
          <CardContent>
            {day && day.starts.length > 0 ? (
              <TimeSlots
                label={t("times.label", { day: dayName })}
                slots={day.starts.map((start) => ({ value: String(start), time: timeOf(start) }))}
                selected={state.start === null ? null : String(state.start)}
                onSelect={(value) => go({ start: Number(value) })}
              />
            ) : (
              <Empty className="p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Clock aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle>{t("times.emptyTitle")}</EmptyTitle>
                  <EmptyDescription>{t("times.emptyDescriptionRoom")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="lg:ml-auto lg:w-[22rem]">
        <ConfirmBooking choice={choice} empty={t("confirm.emptyRoom")} />
      </div>
    </div>
  );
}
