import type { ReactNode } from "react";

import Link from "next/link";

import {
  type BookingPosition,
  type BookingView,
  listMyBookings,
  MY_BOOKINGS_PAGE,
  type MyBookingsView,
} from "@espacios/application";
import type { MemberActor } from "@espacios/domain";
import { CalendarDays, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { companyEdge } from "@/composition";
import { CALENDARIO, pageVistaOf, VISTAS } from "@/lib/bookings/views";
import { requireMember } from "@/lib/session/session";

import { BookingCreatedToast } from "./_components/booking-created-toast";
import { BookingList } from "./_components/booking-list";
import { MyBookingsCalendar } from "./_components/my-bookings-calendar";
import { ViewTabs } from "./_components/view-tabs";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** At most this many bookings of a view reach the table: Próximas the soonest, Pasadas and Canceladas the latest. */
const MY_BOOKINGS_CAP = 500;

/**
 * One view of the company's bookings for the table, read in pages of the API's largest size until the view ends or the
 * cap is reached. The table then searches, filters and pages them in the browser, as every list of the app does.
 */
async function readView(actor: MemberActor, view: MyBookingsView) {
  const bookings: BookingView[] = [];
  let after: BookingPosition | null = null;
  do {
    const result = await listMyBookings(companyEdge(), actor, { view, after, limit: MY_BOOKINGS_PAGE.maxLimit });
    // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
    if (!result.ok) throw new Error(`listMyBookings: ${result.reason}`);
    bookings.push(...result.value.bookings);
    after = result.value.next;
  } while (after && bookings.length < MY_BOOKINGS_CAP);
  return { bookings: bookings.slice(0, MY_BOOKINGS_CAP), capped: after !== null || bookings.length > MY_BOOKINGS_CAP };
}

/**
 * `Mis reservas` (spec 0003), the member's home on the company edge: every booking of the company, by any member, in
 * three views reached by URL (`?vista=proximas|pasadas|canceladas`), each a table to search, filter and page. Without a
 * session it redirects to the picker; the operator gets 403. `?nueva=<id>` (set by the booking redirect) shows the
 * toast, marks that row and opens the table on its page.
 */
export default async function MyBookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor } = await requireMember();
  const [t, params] = await Promise.all([getTranslations("home"), searchParams]);
  const vista = pageVistaOf(params.vista);
  const newId = typeof params.nueva === "string" ? params.nueva : null;

  const newBooking = (
    <Button asChild>
      <Link href="/reservas/nueva">
        <Plus aria-hidden />
        {t("newBooking")}
      </Link>
    </Button>
  );

  const content =
    vista === CALENDARIO ? <MyBookingsCalendar /> : await listView(actor, VISTAS[vista], newId, newBooking);

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

      {content}
    </div>
  );
}

/** One list view: its empty state, or the table of its bookings. */
async function listView(actor: MemberActor, view: MyBookingsView, newId: string | null, newBooking: ReactNode) {
  const [t, { bookings, capped }] = await Promise.all([getTranslations("home"), readView(actor, view)]);
  return bookings.length === 0 ? (
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
      bookings={bookings}
      capped={capped}
      newId={newId}
    />
  );
}
