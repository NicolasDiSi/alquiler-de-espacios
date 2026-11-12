"use client";

import { useState } from "react";

import Link from "next/link";

import type { RoomDay } from "@espacios/application";
import { formatTime } from "@espacios/domain";
import { cn } from "cn";
import { Building2, Clock, MapPin, Plus, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Quick filters: by size (capacity) or by being free right now. */
const FILTERS = {
  all: () => true,
  free: (room: RoomDay) => room.now?.state === "free",
  small: (room: RoomDay) => room.room.capacity <= 4,
  medium: (room: RoomDay) => room.room.capacity >= 5 && room.room.capacity <= 9,
  large: (room: RoomDay) => room.room.capacity >= 10,
} as const;
type Filter = keyof typeof FILTERS;

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** How a room reads right now, in words; the badge color only reinforces them. */
function NowBadge({ room }: { readonly room: RoomDay }) {
  const t = useTranslations("rooms.now");
  if (!room.open) return <Badge variant="outline">{t("closedToday")}</Badge>;
  const now = room.now;
  if (!now) return null;
  const until = now.until === null ? "" : formatTime(now.until);
  if (now.state === "free") {
    return (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
        <span aria-hidden className="bg-success size-1.5 rounded-full" />
        {t("free")}
      </Badge>
    );
  }
  if (now.state === "busy") {
    return (
      <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
        <span aria-hidden className="bg-warning size-1.5 rounded-full" />
        {t("busyUntil", { time: until })}
      </Badge>
    );
  }
  if (now.state === "blocked") return <Badge variant="secondary">{t("blockedUntil", { time: until })}</Badge>;
  return <Badge variant="outline">{t("closedNow")}</Badge>;
}

/**
 * The rooms of one sede for a company (spec 0008, AC-1): pick the sede, search by name, narrow by size or by free now,
 * and read each room's state and today's slots. "Ver disponibilidad" opens its calendar, "Reservar" the booking form.
 */
export function RoomGrid({ rooms }: { readonly rooms: readonly RoomDay[] }) {
  const t = useTranslations("rooms");
  const facilities = [...new Map(rooms.map((room) => [room.room.facility.id, room.room.facility])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const facility = facilities.find((item) => item.id === facilityId) ?? facilities[0];
  const searched = rooms.filter(
    (room) => room.room.facility.id === facility?.id && fold(room.room.name).includes(fold(query.trim())),
  );
  const shown = searched.filter(FILTERS[filter]).sort((a, b) => a.room.name.localeCompare(b.room.name));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        {facility ? (
          <p className="bg-muted text-muted-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm">
            <Clock aria-hidden className="size-4" />
            {t("hours", { opens: facility.opensAt, closes: facility.closesAt })}
          </p>
        ) : null}
      </div>

      <section aria-label={t("filters.label")} className="bg-card flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={facility?.id ?? ""} onValueChange={setFacilityId}>
            <SelectTrigger className="w-full sm:w-60" aria-label={t("filters.facility")}>
              <MapPin aria-hidden />
              <SelectValue />
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
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("filters.search")}
              aria-label={t("filters.search")}
              className="pl-8"
            />
          </div>
          <p className="text-muted-foreground ml-auto text-sm" aria-live="polite">
            {t("filters.count", { shown: shown.length, total: searched.length })}
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={2}
          aria-label={t("filters.quick")}
          value={filter}
          onValueChange={(next) => (next ? setFilter(next as Filter) : null)}
          className="flex-wrap"
        >
          {(Object.keys(FILTERS) as Filter[]).map((key) => (
            <ToggleGroupItem key={key} value={key} className="rounded-full px-3 text-xs">
              {t(`filters.${key}`, { count: searched.filter(FILTERS[key]).length })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      {shown.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border p-6 text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((room) => {
            const blockedAllDay = room.slots.length > 0 && room.slots.every((slot) => slot.state === "blocked");
            return (
              <li key={room.room.id} className="bg-card flex flex-col rounded-lg border shadow-xs">
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <h2 className="text-base font-semibold">{room.room.name}</h2>
                      <p className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Building2 aria-hidden className="size-3.5" />
                        {room.room.facility.name}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      <Users aria-hidden />
                      {t("capacity", { count: room.room.capacity })}
                    </Badge>
                  </div>
                  <div>
                    <NowBadge room={room} />
                  </div>
                </div>
                <div className="flex gap-2 border-t p-3">
                  <Button asChild variant="outline" className="flex-1">
                    <Link href={`/salas/${room.room.id}`}>{t("actions.availability")}</Link>
                  </Button>
                  {blockedAllDay ? null : (
                    <Button asChild className="flex-1">
                      <Link href={`/reservas/nueva?sala=${room.room.id}`}>
                        <Plus aria-hidden />
                        {t("actions.book")}
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
