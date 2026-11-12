import { getRoomsAvailability } from "@espacios/application";
import { todayAt } from "@espacios/domain";
import { DoorOpen } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { companyEdge } from "@/composition";
import { TIME_ZONE } from "@/i18n/config";
import { requireMember } from "@/lib/session/session";

import { RoomGrid } from "./_components/room-grid";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rooms");
  return { title: t("title") };
}

/**
 * Salas (spec 0008, AC-1), on the company edge: every bookable room with its state now and today's slots, from one read
 * of busy time. The sede, the search and the quick filters narrow them in the browser. The operator gets 403.
 */
export default async function RoomsPage() {
  const { actor } = await requireMember();
  const t = await getTranslations("rooms");
  const edge = companyEdge();
  const now = edge.clock.now();

  const result = await getRoomsAvailability(edge, actor, { date: todayAt(now, TIME_ZONE) });
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!result.ok) throw new Error(`getRoomsAvailability: ${result.reason}`);

  if (result.value.rooms.length === 0) {
    return <EmptyState icon={DoorOpen} title={t("emptyAll.title")} description={t("emptyAll.description")} />;
  }
  return <RoomGrid rooms={result.value.rooms} />;
}
