"use client";

import { BOOKING_DURATIONS } from "@espacios/domain";
import { Minus, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type BookingSearch, PEOPLE_MAX } from "@/lib/bookings/search";

/**
 * What the search is for (spec 0008): how long, how many people, and whether busy rooms are listed. Every change is
 * applied in the browser over the month already read, so the stepper and the toggles answer at once.
 */
export function BookingFilters({
  search,
  go,
}: {
  readonly search: BookingSearch;
  readonly go: (patch: Partial<BookingSearch>) => void;
}) {
  const t = useTranslations("booking.filters");

  return (
    <Card>
      <CardContent>
        <FieldGroup className="gap-4">
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

          <FieldSeparator />

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

          <FieldSeparator />

          {/* The whole row is the switch's label, so the target is the row, not the 18 pixel control. */}
          <FieldLabel htmlFor="filter-only-free" className="min-h-11 cursor-pointer">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{t("onlyFree")}</FieldTitle>
                <FieldDescription>{t("onlyFreeHint")}</FieldDescription>
              </FieldContent>
              <Switch
                id="filter-only-free"
                checked={search.onlyFree}
                onCheckedChange={(onlyFree) => go({ onlyFree })}
              />
            </Field>
          </FieldLabel>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
