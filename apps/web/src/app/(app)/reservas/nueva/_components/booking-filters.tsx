"use client";

import { BOOKING_DURATIONS } from "@espacios/domain";
import { Minus, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type BookingSearch, PEOPLE_MAX } from "@/lib/bookings/search";

type SearchProps = {
  readonly search: BookingSearch;
  readonly go: (patch: Partial<BookingSearch>) => void;
};

/**
 * How many people (spec 0008). Every filter is applied in the browser over the month already read, so the stepper
 * and the toggles answer at once. The filters are separate fields, placed in the search's groups from `md` and in the
 * filters sheet on a phone.
 */
export function PeopleField({ search, go }: SearchProps) {
  const t = useTranslations("booking.filters");
  return (
    <Field orientation="horizontal" className="items-center justify-between">
      <FieldContent>
        <FieldLabel id="filter-people" className="flex items-center gap-2">
          <Users aria-hidden className="size-4" />
          {t("people")}
        </FieldLabel>
        <FieldDescription>{t("peopleMin", { people: search.people })}</FieldDescription>
      </FieldContent>
      <fieldset aria-labelledby="filter-people" className="m-0 flex items-center gap-1 rounded-lg border p-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={t("fewer")}
          disabled={search.people <= 1}
          onClick={() => go({ people: search.people - 1 })}
        >
          <Minus aria-hidden />
        </Button>
        <output aria-live="polite" className="min-w-8 text-center text-lg font-semibold tabular-nums">
          {search.people}
        </output>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={t("more")}
          disabled={search.people >= PEOPLE_MAX}
          onClick={() => go({ people: search.people + 1 })}
        >
          <Plus aria-hidden />
        </Button>
      </fieldset>
    </Field>
  );
}

/** How long, on the 30 minute steps the booking rules allow. */
export function DurationField({ search, go }: SearchProps) {
  const t = useTranslations("booking.filters");
  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel id="filter-duration">{t("duration")}</FieldLabel>
        <span className="text-primary text-sm font-medium">
          {t("minutes", { hours: Math.floor(search.minutes / 60), minutes: search.minutes % 60 })}
        </span>
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={2}
        aria-labelledby="filter-duration"
        value={String(search.minutes)}
        onValueChange={(next) => (next ? go({ minutes: Number(next) }) : null)}
        className="grid w-full grid-cols-3"
      >
        {BOOKING_DURATIONS.map((minutes) => (
          <ToggleGroupItem
            key={minutes}
            value={String(minutes)}
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11"
          >
            {t("minutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

/** Whether busy rooms are listed. The whole row is the switch's label, so the target is the row, not the control. */
export function OnlyFreeSwitch({ search, go }: SearchProps) {
  const t = useTranslations("booking.filters");
  return (
    <FieldLabel htmlFor="filter-only-free" className="min-h-11 cursor-pointer">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle id="filter-only-free-title">{t("onlyFree")}</FieldTitle>
          <FieldDescription id="filter-only-free-hint">{t("onlyFreeHint")}</FieldDescription>
        </FieldContent>
        {/* A switch is a button, and a button is not named by its label element: it points at its texts. */}
        <Switch
          id="filter-only-free"
          aria-labelledby="filter-only-free-title"
          aria-describedby="filter-only-free-hint"
          checked={search.onlyFree}
          onCheckedChange={(onlyFree) => go({ onlyFree })}
        />
      </Field>
    </FieldLabel>
  );
}
