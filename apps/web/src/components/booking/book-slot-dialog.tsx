"use client";

import type { FacilityMonthRoom } from "@espacios/application";
import type { LocalDate } from "@espacios/domain";
import { useFormatter, useTranslations } from "next-intl";

import { ConfirmForm } from "@/components/booking/confirm-booking";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { choiceRoom, type MonthData } from "@/lib/bookings/month";
import { roomOptions } from "@/lib/bookings/room-matrix";
import { timeOf } from "@/lib/bookings/search";

/** The range picked in the matrix: its column (the room), start and length in local minutes. */
export type Draft = { readonly column: number; readonly start: number; readonly minutes: number };

/**
 * Books the range picked in the matrix (spec 0009): the room and the day are fixed, the start and the length can be
 * changed (only free ones are offered) and the card in the matrix follows them. "Confirmar reserva" books through
 * `bookRoom`, so a refusal keeps its reason; "Cancelar", Escape or a click outside drop the card.
 */
export function BookSlotDialog({
  month,
  room,
  day,
  now,
  draft,
  onChange,
  onClose,
}: {
  readonly month: MonthData;
  readonly room: FacilityMonthRoom;
  readonly day: LocalDate;
  readonly now: Date;
  readonly draft: Draft;
  readonly onChange: (draft: Draft) => void;
  readonly onClose: () => void;
}) {
  const t = useTranslations("rooms.matrix.dialog");
  const filters = useTranslations("booking.filters");
  const format = useFormatter();
  const { starts, durations } = roomOptions(month, room.id, day, now, draft.start);
  const dayName = format.dateTime(new Date(`${day}T12:00:00Z`), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const end = draft.start + draft.minutes;
  const fits = durations.includes(draft.minutes);

  const pickStart = (start: number) => {
    const next = roomOptions(month, room.id, day, now, start).durations;
    onChange({
      ...draft,
      start,
      minutes: next.includes(draft.minutes) ? draft.minutes : (next.at(-1) ?? draft.minutes),
    });
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { room: room.name })}</DialogTitle>
          <DialogDescription className="first-letter:uppercase">
            {t("description", { day: dayName, facility: month.facility.name, capacity: room.capacity })}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="slot-start">{t("start")}</FieldLabel>
            <Select value={String(draft.start)} onValueChange={(value) => pickStart(Number(value))}>
              <SelectTrigger id="slot-start" className="h-11 w-full data-[size=default]:h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {starts.map((start) => (
                    <SelectItem key={start} value={String(start)}>
                      {timeOf(start)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel id="slot-length">{t("length")}</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={2}
              aria-labelledby="slot-length"
              value={String(draft.minutes)}
              onValueChange={(value) => (value ? onChange({ ...draft, minutes: Number(value) }) : null)}
              className="grid w-full grid-cols-3"
            >
              {durations.map((minutes) => (
                <ToggleGroupItem
                  key={minutes}
                  value={String(minutes)}
                  className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11"
                >
                  {filters("minutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <p className="bg-primary/10 text-primary rounded-md px-3 py-2 text-sm font-medium">
            {t("summary", { start: timeOf(draft.start), end: timeOf(end) })}
          </p>
        </FieldGroup>

        {fits ? (
          <ConfirmForm
            key={`${draft.start}:${draft.minutes}`}
            choice={{ room: choiceRoom(month, room), date: day, start: timeOf(draft.start), end: timeOf(end) }}
            onBooked={onClose}
          />
        ) : null}
        <DialogClose asChild>
          <Button variant="outline" className="h-11">
            {t("cancel")}
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
