import Link from "next/link";

import { DoorOpen } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { companyEdge } from "@/composition";
import { requireMember } from "@/lib/session/session";

import { BookingForm } from "./_components/booking-form";
import { initialBookingValues, type PrefillParams } from "./_lib/form-options";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookingForm");
  return { title: t("metaTitle") };
}

/**
 * `/reservas/nueva` (spec 0003), company edge only: without a session it redirects to the picker, the operator gets
 * 403. `?sala=&fecha=&inicio=&fin=` prefills the form; values the form would not offer are dropped.
 */
export default async function NewBookingPage({ searchParams }: { searchParams: Promise<PrefillParams> }) {
  await requireMember();
  const t = await getTranslations("bookingForm");
  const edge = companyEdge();
  const [rooms, params] = await Promise.all([edge.rooms.listRooms(), searchParams]);
  // The server's clock decides the default day and which days and starts the form offers (spec 0003).
  const now = edge.clock.now();

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <Button asChild variant="link" className="px-0">
          <Link href="/">{t("back")}</Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      {rooms.length === 0 ? (
        <EmptyState icon={DoorOpen} title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <BookingForm rooms={rooms} initialValues={initialBookingValues(now, params, rooms)} now={now.toISOString()} />
      )}
    </div>
  );
}
