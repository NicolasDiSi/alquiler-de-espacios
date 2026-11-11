"use client";

import { useEffect, useRef } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

/**
 * After the `bookRoom` redirect (`?nueva=<id>`): shows "Reserva confirmada" once, then drops `nueva` from the address
 * so a reload does not repeat it (spec 0003). `history.replaceState` changes the address without a new server render,
 * so the "Nueva" badge stays on the row.
 */
export function BookingCreatedToast() {
  const t = useTranslations("success");
  // React runs effects twice in development; the toast must still show once.
  const shown = useRef<"pending" | "done">("pending");

  useEffect(() => {
    if (shown.current === "done") return;
    shown.current = "done";
    toast.success(t("bookingConfirmed"));
    const url = new URL(window.location.href);
    url.searchParams.delete("nueva");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [t]);

  return null;
}
