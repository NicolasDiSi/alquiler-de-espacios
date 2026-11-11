import Link from "next/link";

import { listMyBookings, MY_BOOKINGS_PAGE } from "@espacios/application";
import { CalendarDays, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { companyEdge } from "@/composition";
import { encodeCursor } from "@/lib/bookings/cursor";
import { VISTAS, vistaOf } from "@/lib/bookings/views";
import { requireMember } from "@/lib/session/session";

import { BookingCreatedToast } from "./_components/booking-created-toast";
import { BookingList } from "./_components/booking-list";
import { ViewTabs } from "./_components/view-tabs";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * `Mis reservas` (spec 0003), the member's home on the company edge: every booking of the company, by any member, in
 * three views reached by URL (`?vista=proximas|pasadas|canceladas`). Without a session it redirects to the picker; the
 * operator gets 403. `?nueva=<id>` (set by the booking redirect) shows the toast and marks that row.
 */
export default async function MyBookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor } = await requireMember();
  const [t, params] = await Promise.all([getTranslations("home"), searchParams]);
  const vista = vistaOf(params.vista);
  const view = VISTAS[vista];
  const newId = typeof params.nueva === "string" ? params.nueva : null;

  const result = await listMyBookings(companyEdge(), actor, {
    view,
    after: null,
    limit: MY_BOOKINGS_PAGE.defaultLimit,
  });
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!result.ok) throw new Error(`listMyBookings: ${result.reason}`);
  const { bookings, next } = result.value;

  const newBooking = (
    <Button asChild>
      <Link href="/reservas/nueva">
        <Plus aria-hidden />
        {t("newBooking")}
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {newId ? <BookingCreatedToast /> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        {newBooking}
      </div>

      <ViewTabs current={vista} />

      {bookings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={t(`empty.${view}.title`)}
          description={t(`empty.${view}.description`)}
          action={view === "upcoming" ? newBooking : undefined}
        />
      ) : (
        <BookingList
          // A new view starts from its own first page.
          key={view}
          view={view}
          initial={{ bookings, nextCursor: next ? encodeCursor(view, next) : null }}
          newId={newId}
        />
      )}
    </div>
  );
}
