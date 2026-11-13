"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { FieldSeparator } from "@/components/ui/field";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { BookingSearch } from "@/lib/bookings/search";

import { DurationField, OnlyFreeSwitch, PeopleField } from "./booking-filters";
import { type Facility, FacilitySelect } from "./search-header";

/**
 * The filters on a phone (as `/salas` does): one button that says what is chosen ("Sede Central · 1 h · 2 personas")
 * and opens the sede, the people, the length and "solo libres" in a sheet from the bottom. Each change applies at
 * once, as in the columns; the footer closes it. A new sede reads new data, so the view is mounted again and the sheet
 * closes with the new sede chosen.
 */
export function FiltersSheet({
  facilities,
  facility,
  search,
  go,
}: {
  readonly facilities: readonly Facility[];
  readonly facility: Facility | undefined;
  readonly search: BookingSearch;
  readonly go: (patch: Partial<BookingSearch>) => void;
}) {
  const t = useTranslations("booking");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-auto min-h-11 w-full justify-start py-2 text-left">
          <SlidersHorizontal aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{t("groups.filters")}</span>
            <span className="text-muted-foreground truncate text-xs font-normal">
              {t("filters.summary", {
                facility: facility?.name ?? "",
                hours: Math.floor(search.minutes / 60),
                minutes: search.minutes % 60,
                people: search.people,
              })}
            </span>
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[90svh] gap-0 overflow-y-auto">
        <SheetHeader className="border-b">
          <SheetTitle>{t("groups.filters")}</SheetTitle>
          <SheetDescription>{t("groups.filtersDescription")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          <FacilitySelect facilities={facilities} facility={facility} onFacility={(facilityId) => go({ facilityId })} />
          <FieldSeparator />
          <PeopleField search={search} go={go} />
          <FieldSeparator />
          <DurationField search={search} go={go} />
          <OnlyFreeSwitch search={search} go={go} />
        </div>
        <SheetFooter className="border-t">
          <SheetClose asChild>
            <Button className="h-11">{t("groups.showRooms")}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
