import { listFacilities, listRooms, toOperatorFacilityViews } from "@espacios/application";
import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { operatorEdge } from "@/composition";
import { requireOperator } from "@/lib/session/session";

import { CreateFacilityDialog } from "./_components/create-facility-dialog";
import { FacilityList } from "./_components/facility-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator.facility");
  return { title: t("title") };
}

/**
 * Sedes (spec 0005), on the operator edge: every sede, active and retired, with its hours and active rooms. Two reads
 * whatever the number of sedes; the list narrows them on the client. A member gets 403.
 */
export default async function FacilitiesPage() {
  const { actor } = await requireOperator();
  const t = await getTranslations("operator.facility");
  const edge = operatorEdge();

  const [facilities, rooms] = await Promise.all([
    listFacilities(edge, actor, true),
    listRooms(edge, actor, { includeInactive: true }),
  ]);
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!facilities.ok) throw new Error(`listFacilities: ${facilities.reason}`);
  if (!rooms.ok) throw new Error(`listRooms: ${rooms.reason}`);
  const views = toOperatorFacilityViews(facilities.value, rooms.value);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <CreateFacilityDialog />
      </div>

      {views.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("empty.title")}
          description={t("empty.description")}
          action={<CreateFacilityDialog />}
        />
      ) : (
        <FacilityList facilities={views} />
      )}
    </div>
  );
}
