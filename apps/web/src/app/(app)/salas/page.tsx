import { getFacilityMonth } from "@espacios/application";
import { formatTime } from "@espacios/domain";
import { DoorOpen } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { companyEdge } from "@/composition";
import { facilitiesOf, monthGrid, monthOf, readRoomsSearch } from "@/lib/bookings/search";
import { requireMember } from "@/lib/session/session";

import { RoomsWeek } from "./_components/rooms-week";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rooms");
  return { title: t("title") };
}

/**
 * Salas (spec 0009), on the company edge: one sede's week, its rooms as a calendar (a column per room) or as cards
 * (spec 0008's grid). The server reads the six weeks of the chosen day's month, so moving a week rarely asks again and
 * "Ir a fecha" can mark the month's days with room. The page does not wait for that read: it starts it and hands the
 * promise over, so the filters paint at once and the matrix streams in behind its own `<Suspense>`. Only a new sede or
 * month comes back here; the day and the people are applied in the
 * browser, and so is the choice of view. The view is keyed by both, so new data starts from the search the URL asked for.
 */
export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Partial<Record<"sede" | "fecha" | "personas" | "vista" | "tamano", string | string[]>>>;
}) {
  const { actor } = await requireMember();
  const [t, params] = await Promise.all([getTranslations("rooms"), searchParams]);
  const edge = companyEdge();
  const rooms = await edge.rooms.listRooms();
  const now = edge.clock.now();
  const search = readRoomsSearch(now, params, rooms);
  if (!search) {
    return <EmptyState icon={DoorOpen} title={t("emptyAll.title")} description={t("emptyAll.description")} />;
  }

  // The six weeks the month of `fecha` draws: every week of the month, and every day "Ir a fecha" marks.
  const month = monthOf(search.date);
  const week = getFacilityMonth(edge, actor, { facilityId: search.facilityId, ...monthGrid(month) });

  return (
    <RoomsWeek
      key={`${search.facilityId}:${month}`}
      initial={search}
      facilities={facilitiesOf(rooms).map((facility) => ({
        id: facility.id,
        name: facility.name,
        timeZone: facility.timeZone,
        opensAt: formatTime(facility.opensAt),
        closesAt: formatTime(facility.closesAt),
        openWeekdays: facility.openWeekdays,
      }))}
      rooms={rooms.map((room) => ({ facilityId: room.facility.id, name: room.name, capacity: room.capacity }))}
      week={week}
      now={now}
      // The matrix keeps the screen: its grid scrolls inside this height, never the page.
      calendarClassName="h-[min(46rem,calc(100dvh-8rem))] min-h-[28rem]"
    />
  );
}
