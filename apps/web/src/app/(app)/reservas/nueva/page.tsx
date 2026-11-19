import { getFacilityMonth } from "@espacios/application";
import { formatTime } from "@espacios/domain";
import { DoorOpen } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { companyEdge } from "@/composition";
import { facilitiesOf, monthGrid, readSearch, type SearchParams } from "@/lib/bookings/search";
import { requireMember } from "@/lib/session/session";

import { BookingSearchView } from "./_components/booking-search";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newBooking");
  return { title: t("title") };
}

/**
 * `/reservas/nueva` (spec 0003, rebuilt by spec 0008, AC-3), company edge only. The server reads one thing: the sede's
 * rooms and their busy time over the month the calendar shows. Day, start, duration, people, room and "solo libres"
 * are applied in the browser over that data, so only a new sede or month comes back here. The view is keyed by both,
 * so new data starts from the search the URL asked for. Only "Confirmar reserva" books, through `bookRoom`.
 */
export default async function NewBookingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { actor } = await requireMember();
  const [t, params] = await Promise.all([getTranslations("newBooking"), searchParams]);
  const edge = companyEdge();
  const rooms = await edge.rooms.listRooms();
  const now = edge.clock.now();
  const search = readSearch(now, params, rooms);
  if (!search) {
    return <EmptyState icon={DoorOpen} title={t("empty.title")} description={t("empty.description")} />;
  }

  const month = await getFacilityMonth(edge, actor, { facilityId: search.facilityId, ...monthGrid(search.month) });
  // A refusal here is a database that could not answer in time, or a sede retired since the rooms were read.
  if (!month.ok) throw new Error(`getFacilityMonth: ${month.reason}`);

  return (
    <BookingSearchView
      key={`${search.facilityId}:${search.month}`}
      initial={search}
      facilities={facilitiesOf(rooms).map((facility) => ({
        id: facility.id,
        name: facility.name,
        timeZone: facility.timeZone,
        opensAt: formatTime(facility.opensAt),
        closesAt: formatTime(facility.closesAt),
      }))}
      month={month.value}
      now={now}
    />
  );
}
