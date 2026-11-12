import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getFacility,
  listBlocks,
  listRooms,
  toOperatorBlockViews,
  toOperatorFacilityView,
  toOperatorRoomView,
  toOperatorWeekView,
} from "@espacios/application";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { operatorEdge } from "@/composition";
import { zoneLabel } from "@/lib/operator/format";
import { requireOperator } from "@/lib/session/session";

import { Facts } from "../../_components/facts";
import { SectionEmpty } from "../../_components/section-empty";
import { RecordStatusDot } from "../../_components/status";
import { DeactivateFacilityButton } from "../_components/deactivate-facility-button";
import { EditFacilityDialog } from "../_components/edit-facility-dialog";
import { WeekDays } from "../_components/week-days";
import { BlockList } from "./_components/block-list";
import { CreateBlockDialog } from "./_components/create-block-dialog";
import { CreateRoomDialog } from "./_components/create-room-dialog";
import { RoomList } from "./_components/room-list";
import { WeekStrip } from "./_components/week-strip";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator.facility");
  return { title: t("detailTitle") };
}

/**
 * One sede (spec 0005, AC-5): its data, its rooms and its blocks, three reads whatever their size. A retired sede shows
 * its history read only. An unknown id is a 404.
 */
export default async function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOperator();
  const [{ id }, t, rooms, blocks] = await Promise.all([
    params,
    getTranslations("operator.facility"),
    getTranslations("operator.room"),
    getTranslations("operator.block"),
  ]);
  const edge = operatorEdge();

  const found = await getFacility(edge, actor, id);
  if (!found.ok) {
    if (found.reason === "not_found") notFound();
    throw new Error(`getFacility: ${found.reason}`);
  }
  const record = found.value;
  const [roomRecords, blockRecords] = await Promise.all([
    listRooms(edge, actor, { facilityId: id, includeInactive: true }),
    listBlocks(edge, actor, { facilityId: id, includeReleased: true }),
  ]);
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!roomRecords.ok) throw new Error(`listRooms: ${roomRecords.reason}`);
  if (!blockRecords.ok) throw new Error(`listBlocks: ${blockRecords.reason}`);

  const roomViews = roomRecords.value.map((room) => toOperatorRoomView(room, record.timeZone));
  const facility = toOperatorFacilityView(record, roomViews.filter((room) => room.status === "active").length);
  const now = edge.clock.now();
  const blockViews = toOperatorBlockViews(blockRecords.value, roomRecords.value, record.timeZone, now);
  const week = toOperatorWeekView(record, blockRecords.value, roomRecords.value, now);
  const active = facility.status === "active";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/operador/sedes"
          className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{facility.name}</h1>
            <RecordStatusDot status={facility.status} since={facility.deactivatedAt} gender="f" />
          </div>
          {active ? (
            <div className="flex flex-wrap items-start gap-2">
              <EditFacilityDialog facility={facility} />
              <DeactivateFacilityButton facility={facility} />
            </div>
          ) : null}
        </div>
        <Facts
          items={[
            { term: t("columns.address"), value: facility.address ?? t("noAddress") },
            { term: t("columns.timeZone"), value: zoneLabel(facility.timeZone) },
            { term: t("columns.hours"), value: t("hours", { from: facility.opensAt, to: facility.closesAt }) },
            { term: t("columns.days"), value: <WeekDays open={facility.openWeekdays} /> },
            { term: t("columns.rooms"), value: facility.activeRooms },
          ]}
        />
      </div>

      {active ? <WeekStrip week={week} timeZone={zoneLabel(facility.timeZone)} /> : null}

      <section aria-labelledby="rooms-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="rooms-title" className="text-lg font-semibold">
            {rooms("title")}
          </h2>
          {active ? <CreateRoomDialog facilityId={facility.id} timeZone={facility.timeZone} /> : null}
        </div>
        {roomViews.length === 0 ? (
          <SectionEmpty>{active ? rooms("empty") : rooms("emptyRetired")}</SectionEmpty>
        ) : (
          <RoomList facility={facility} rooms={roomViews} />
        )}
      </section>

      <section aria-labelledby="blocks-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="blocks-title" className="text-lg font-semibold">
            {blocks("title")}
          </h2>
          {active ? (
            <CreateBlockDialog facility={facility} rooms={roomViews.filter((room) => room.status === "active")} />
          ) : null}
        </div>
        {blockViews.length === 0 ? (
          <SectionEmpty>{active ? blocks("empty") : blocks("emptyRetired")}</SectionEmpty>
        ) : (
          <BlockList facility={facility} blocks={blockViews} />
        )}
      </section>
    </div>
  );
}
