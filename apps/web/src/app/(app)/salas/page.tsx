import { getFacilityMonth } from "@espacios/application";
import { addDays, formatTime } from "@espacios/domain";
import { DoorOpen } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { companyEdge } from "@/composition";
import { facilitiesOf, mondayOf, readRoomsSearch } from "@/lib/bookings/search";
import { requireMember } from "@/lib/session/session";

import { RoomsWeek } from "./_components/rooms-week";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rooms");
  return { title: t("title") };
}

/**
 * Salas (spec 0009), on the company edge: one sede's week as a matrix, a column per room. The page does not wait for
 * the week: it starts the read and hands the promise over, so the filters paint at once and the matrix streams in
 * behind its own `<Suspense>`. Only a new sede or week comes back here; the day and the people are applied in the
 * browser. The view is keyed by both, so new data starts from the search the URL asked for.
 */
export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Partial<Record<"sede" | "fecha" | "personas", string | string[]>>>;
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

  const monday = mondayOf(search.date);
  const week = getFacilityMonth(edge, actor, { facilityId: search.facilityId, from: monday, to: addDays(monday, 6) });

  return (
    <RoomsWeek
      key={`${search.facilityId}:${monday}`}
      initial={search}
      facilities={facilitiesOf(rooms).map((facility) => ({
        id: facility.id,
        name: facility.name,
        timeZone: facility.timeZone,
        opensAt: formatTime(facility.opensAt),
        closesAt: formatTime(facility.closesAt),
        openWeekdays: facility.openWeekdays,
      }))}
      week={week}
      now={now}
    />
  );
}
