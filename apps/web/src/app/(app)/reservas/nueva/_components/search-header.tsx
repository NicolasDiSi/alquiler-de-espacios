"use client";

import Link from "next/link";

import { Building2, ChevronLeft, Clock, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
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

function FacilitySelect({
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
        className="bg-muted/40 h-auto min-h-11 w-full py-2 text-left data-[size=default]:h-auto lg:w-auto lg:min-w-80"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md lg:size-auto lg:bg-transparent">
            <Building2 aria-hidden className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">
              <SelectValue>{facility?.name}</SelectValue>
            </span>
            {facility ? (
              <span className="text-muted-foreground truncate text-xs lg:hidden">
                {t("search.facilityHours", { opens: facility.opensAt, closes: facility.closesAt })} ·{" "}
                {zoneLabel(facility.timeZone)}
              </span>
            ) : null}
          </span>
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
 * The page's head (spec 0008): the title and the sede, which is the one choice that reads new data. From `lg` a card
 * with the sede's hours and the way to the whole catalog; on a phone a compact bar with a way back, and the sede as
 * its own card with its hours.
 */
export function SearchHeader({
  facilities,
  facility,
  onFacility,
}: {
  readonly facilities: readonly Facility[];
  readonly facility: Facility | undefined;
  readonly onFacility: (facilityId: string) => void;
}) {
  const t = useTranslations("booking.search");
  const page = useTranslations("newBooking");

  return (
    <>
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
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
        <FacilitySelect facilities={facilities} facility={facility} onFacility={onFacility} />
      </div>

      <div className="bg-card hidden flex-wrap items-end justify-between gap-4 rounded-xl border p-5 shadow-sm lg:flex">
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{page("title")}</h1>
            <p className="text-muted-foreground text-sm">{page("description")}</p>
          </div>
          <FacilitySelect facilities={facilities} facility={facility} onFacility={onFacility} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {facility ? (
            <Badge variant="outline" className="h-11 gap-2 rounded-md px-3 text-sm font-normal">
              <Clock aria-hidden />
              {t("hours", { opens: facility.opensAt, closes: facility.closesAt, zone: zoneLabel(facility.timeZone) })}
            </Badge>
          ) : null}
          <Button asChild variant="outline" className="h-11">
            <Link href="/salas">
              <LayoutGrid aria-hidden />
              {page("allRooms")}
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
