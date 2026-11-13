"use client";

import Link from "next/link";

import { ChevronLeft, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { zoneLabel } from "@/lib/operator/format";

export type Facility = {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly opensAt: string;
  readonly closesAt: string;
};

/** The sede, the one choice that reads new data, with its hours and time zone under its name. */
export function FacilitySelect({
  facilities,
  facility,
  onFacility,
}: {
  readonly facilities: readonly Facility[];
  readonly facility: Facility | undefined;
  readonly onFacility: (facilityId: string) => void;
}) {
  const t = useTranslations("booking");
  return (
    <Select value={facility?.id ?? ""} onValueChange={onFacility}>
      <SelectTrigger
        aria-label={t("filters.facility")}
        className="bg-muted/40 h-auto min-h-11 w-full py-2 text-left data-[size=default]:h-auto"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">
            <SelectValue>{facility?.name}</SelectValue>
          </span>
          {facility ? (
            <span className="text-muted-foreground truncate text-xs">
              {t("search.hours", {
                opens: facility.opensAt,
                closes: facility.closesAt,
                zone: zoneLabel(facility.timeZone),
              })}
            </span>
          ) : null}
        </span>
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          {facilities.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/**
 * The page's head (spec 0008): the title and the way to the whole catalog. On a phone a compact bar with a way back.
 */
export function SearchHeader() {
  const t = useTranslations("booking.search");
  const page = useTranslations("newBooking");

  return (
    <>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 lg:hidden">
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link href="/" aria-label={t("back")}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">{page("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <Button asChild variant="link" className="h-11 px-2">
          <Link href="/salas">{t("allRoomsShort")}</Link>
        </Button>
      </div>

      <div className="hidden flex-wrap items-end justify-between gap-4 lg:flex">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{page("title")}</h1>
          <p className="text-muted-foreground text-sm">{page("description")}</p>
        </div>
        <Button asChild variant="outline" className="h-11">
          <Link href="/salas">
            <LayoutGrid aria-hidden />
            {page("allRooms")}
          </Link>
        </Button>
      </div>
    </>
  );
}
