"use client";

import { Suspense, useId, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { FacilityMonth } from "@espacios/application";
import type { Result } from "@espacios/domain";
import { cn } from "cn";
import { Building2, CalendarDays, LayoutGrid, Minus, Plus, Search, SlidersHorizontal, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  fitsSize,
  matchesName,
  mondayOf,
  PEOPLE_MAX,
  ROOM_SIZES,
  type RoomSize,
  type RoomsSearch,
  type RoomsView,
  roomsHref,
} from "@/lib/bookings/search";
import { zoneLabel } from "@/lib/operator/format";

import { RoomMatrix } from "./room-matrix";

type Facility = {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly openWeekdays: readonly number[];
};

/** A bookable room, as much as the filters need to count it. */
type RoomRef = { readonly facilityId: string; readonly name: string; readonly capacity: number };

/** The size chip's message key for each size. */
const SIZE_LABEL = { todas: "all", pequenas: "small", medianas: "medium", grandes: "large" } as const satisfies Record<
  RoomSize,
  string
>;

/** What paints while the week is read: the day pills and the matrix, at their final size. */
function MatrixSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-[40rem] w-full rounded-xl" />
    </div>
  );
}

/**
 * Every filter in one place: the sede, the people and the size, with "Restablecer" when any is set. The side card on
 * a wide screen and the body of the filters sheet on a narrow one, so both read the same.
 */
function FilterFields({
  search,
  facilities,
  sizeCount,
  onChange,
}: {
  readonly search: RoomsSearch;
  readonly facilities: readonly Facility[];
  readonly sizeCount: (size: RoomSize) => number;
  readonly onChange: (patch: Partial<RoomsSearch>) => void;
}) {
  const t = useTranslations("rooms.matrix");
  const filters = useTranslations("rooms.filters");
  const sizeId = useId();
  return (
    <FieldGroup className="gap-5">
      <Field>
        <FieldLabel htmlFor={`${sizeId}-facility`}>{t("facility")}</FieldLabel>
        <Select value={search.facilityId} onValueChange={(facilityId) => onChange({ facilityId })}>
          <SelectTrigger id={`${sizeId}-facility`} className="h-11 w-full data-[size=default]:h-11">
            <Building2 aria-hidden />
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
      </Field>
      <Field>
        <FieldLabel id={`${sizeId}-people`}>{t("people")}</FieldLabel>
        <fieldset
          aria-labelledby={`${sizeId}-people`}
          className="m-0 flex h-11 items-center gap-1 rounded-md border px-2"
        >
          <Users aria-hidden className="text-muted-foreground size-4" />
          <output aria-live="polite" className="flex-1 px-1 text-sm font-semibold tabular-nums">
            {t("peopleCount", { count: search.people })}
          </output>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t("fewer")}
            disabled={search.people <= 1}
            onClick={() => onChange({ people: search.people - 1 })}
          >
            <Minus aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t("more")}
            disabled={search.people >= PEOPLE_MAX}
            onClick={() => onChange({ people: search.people + 1 })}
          >
            <Plus aria-hidden />
          </Button>
        </fieldset>
      </Field>
      <Field>
        <FieldLabel id={`${sizeId}-size`}>{t("panel.size")}</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          aria-labelledby={`${sizeId}-size`}
          value={search.size}
          onValueChange={(size) => (size ? onChange({ size: size as RoomSize }) : null)}
          className="flex flex-wrap justify-start"
        >
          {ROOM_SIZES.map((size) => (
            <ToggleGroupItem
              key={size}
              value={size}
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 rounded-full px-3 text-xs"
            >
              {filters(SIZE_LABEL[size], { count: sizeCount(size) })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </FieldGroup>
  );
}

/**
 * `/salas` (spec 0009). Above the matrix, the room search and the choice between calendar and cards; beside it, every
 * filter in one card (from `lg`), or behind a "Filtros" button that opens them in a sheet on a narrower screen. Behind
 * `<Suspense>`, the week's data read with `use()`. A new sede or week goes to the server with `router.replace`; the
 * day, the people, the size and the view are applied here and only mirrored in the URL with the History API; the
 * search is not.
 */
export function RoomsWeek({
  initial,
  facilities,
  rooms,
  week,
  now,
  calendarClassName,
}: {
  readonly initial: RoomsSearch;
  readonly facilities: readonly Facility[];
  readonly rooms: readonly RoomRef[];
  readonly week: Promise<Result<FacilityMonth>>;
  readonly now: Date;
  /** The matrix's frame, sized by the page. */
  readonly calendarClassName?: string;
}) {
  const t = useTranslations("rooms.matrix");
  const filters = useTranslations("rooms.filters");
  const router = useRouter();
  // Read here, not inside the sheet, so its side is known when it opens.
  const isMobile = useIsMobile();
  const [search, setSearch] = useState(initial);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const facility = facilities.find((item) => item.id === search.facilityId);
  const monday = mondayOf(search.date);

  // The sede's rooms the search and the people leave, counted per size for the chips and the summary.
  const sedeRooms = rooms.filter((room) => room.facilityId === search.facilityId);
  const fitting = sedeRooms.filter((room) => room.capacity >= search.people && matchesName(room.name, query));
  const sizeCount = (size: RoomSize) => fitting.filter((room) => fitsSize(room.capacity, size)).length;
  const active = (search.people !== 1 ? 1 : 0) + (search.size !== "todas" ? 1 : 0);

  const go = (patch: Partial<RoomsSearch>) => {
    const next = { ...search, ...patch };
    const href = roomsHref(next);
    if (next.facilityId !== search.facilityId || mondayOf(next.date) !== monday) {
      startTransition(() => router.replace(href, { scroll: false }));
      return;
    }
    setSearch(next);
    window.history.replaceState(null, "", href);
  };
  const reset = () => go({ people: 1, size: "todas" });

  const fields = <FilterFields search={search} facilities={facilities} sizeCount={sizeCount} onChange={go} />;

  return (
    <div className="flex flex-col gap-4">
      <header className="bg-card flex flex-wrap items-start justify-between gap-x-6 gap-y-2 rounded-xl border p-5 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">
            {facility
              ? t("description", {
                  opens: facility.opensAt,
                  closes: facility.closesAt,
                  zone: zoneLabel(facility.timeZone),
                })
              : null}
          </p>
        </div>
        {facility ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {t("panel.summary", { shown: sizeCount(search.size), total: sedeRooms.length, facility: facility.name })}
          </p>
        ) : null}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-2 shadow-sm">
            <div className="relative min-w-48 flex-1">
              <Search aria-hidden className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={filters("search")}
                aria-label={filters("search")}
                className="h-11 pl-9"
              />
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-label={t("view")}
              value={search.view}
              onValueChange={(view) => (view ? go({ view: view as RoomsView }) : null)}
            >
              <ToggleGroupItem
                value="calendario"
                aria-label={t("views.calendario")}
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 px-3"
              >
                <CalendarDays aria-hidden />
                <span className="hidden sm:inline">{t("views.calendario")}</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="grilla"
                aria-label={t("views.grilla")}
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 px-3"
              >
                <LayoutGrid aria-hidden />
                <span className="hidden sm:inline">{t("views.grilla")}</span>
              </ToggleGroupItem>
            </ToggleGroup>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-11 lg:hidden">
                  <SlidersHorizontal aria-hidden />
                  <span className="hidden sm:inline">{t("panel.filters")}</span>
                  {active > 0 ? (
                    <Badge variant="secondary" className="h-5 min-w-5 px-1 tabular-nums">
                      {active}
                    </Badge>
                  ) : null}
                  <span className="sr-only">{t("panel.active", { count: active })}</span>
                </Button>
              </SheetTrigger>
              <SheetContent
                side={isMobile ? "bottom" : "right"}
                showCloseButton={false}
                className="max-h-[90svh] gap-0 overflow-y-auto"
              >
                <SheetHeader className="border-b">
                  <SheetTitle>{t("panel.filters")}</SheetTitle>
                  <SheetDescription>{t("panel.sheetDescription")}</SheetDescription>
                </SheetHeader>
                <div className="p-4">{fields}</div>
                <SheetFooter className="border-t sm:flex-row sm:justify-between">
                  <Button variant="ghost" className="h-11" disabled={active === 0} onClick={reset}>
                    {t("panel.reset")}
                  </Button>
                  <SheetClose asChild>
                    <Button className="h-11">{t("panel.show", { count: sizeCount(search.size) })}</Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>

          <div className={cn("min-w-0 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
            <Suspense fallback={<MatrixSkeleton />}>
              <RoomMatrix
                week={week}
                monday={monday}
                day={search.date}
                people={search.people}
                size={search.size}
                query={query}
                view={search.view}
                now={now}
                onDay={(date) => go({ date })}
                {...(calendarClassName ? { className: calendarClassName } : {})}
              />
            </Suspense>
          </div>
        </div>

        <aside
          aria-label={t("panel.filters")}
          className="bg-card hidden flex-col gap-4 rounded-xl border p-4 shadow-sm lg:sticky lg:top-4 lg:flex"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("panel.filters")}</h2>
            {active > 0 ? (
              <Button variant="link" size="sm" className="h-auto p-0" onClick={reset}>
                {t("panel.reset")}
              </Button>
            ) : null}
          </div>
          {fields}
        </aside>
      </div>
    </div>
  );
}
