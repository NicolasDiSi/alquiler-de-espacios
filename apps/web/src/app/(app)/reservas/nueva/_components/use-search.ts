"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { type BookingSearch, patchSearch, searchHref } from "@/lib/bookings/search";

/**
 * The booking search's state (spec 0008). Only a new sede or month needs data the page does not have: that one goes
 * to the server with `router.replace`, inside a transition so the current month stays on screen (dimmed through
 * `pending`) until the new one arrives. Every other change is applied here and only mirrored in the URL with the
 * native History API, which Next.js syncs with its router without asking the server.
 */
export function useSearch(initial: BookingSearch) {
  const router = useRouter();
  const [search, setSearch] = useState(initial);
  const [pending, startTransition] = useTransition();

  const go = (patch: Partial<BookingSearch>) => {
    const next = patchSearch(search, patch);
    const href = searchHref(next);
    if (next.facilityId !== search.facilityId || next.month !== search.month) {
      startTransition(() => router.replace(href, { scroll: false }));
      return;
    }
    setSearch(next);
    window.history.replaceState(null, "", href);
  };

  return { search, go, pending };
}
