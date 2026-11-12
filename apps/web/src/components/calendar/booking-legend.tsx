"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";

import { HATCH } from "./booking-events";

/** The swatches of `booking-events`, in words: the same five states on every room calendar. */
export function BookingLegend({ className }: { readonly className?: string }) {
  const t = useTranslations("booking.timeline.legend");
  const matrix = useTranslations("rooms.matrix");
  const items = [
    { key: "free", label: t("free"), swatch: "bg-card border-input" },
    { key: "draft", label: matrix("draft"), swatch: "bg-primary border-primary" },
    { key: "mine", label: t("mine"), swatch: "bg-secondary border-primary border-s-4" },
    { key: "booked", label: t("booked"), swatch: "bg-muted border-input border-s-4 border-s-muted-foreground" },
    { key: "blocked", label: t("blocked"), swatch: "bg-muted border-dashed border-input" },
    { key: "past", label: t("past"), swatch: cn("bg-muted border-input", HATCH) },
  ];
  return (
    <ul className={cn("text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3.5 rounded-sm border", item.swatch)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
