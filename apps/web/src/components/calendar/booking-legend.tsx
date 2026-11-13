"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";

import { LEGEND_SWATCH } from "./calendar-look";

/** The swatches of `calendar-look`, in words: the same states, from the same tokens, on every room calendar. */
export function BookingLegend({ className }: { readonly className?: string }) {
  const t = useTranslations("booking.timeline.legend");
  const matrix = useTranslations("rooms.matrix");
  const items = [
    { key: "free", label: t("free"), swatch: LEGEND_SWATCH.free },
    { key: "draft", label: matrix("draft"), swatch: LEGEND_SWATCH.draft },
    { key: "mine", label: t("mine"), swatch: LEGEND_SWATCH.mine },
    { key: "booked", label: t("booked"), swatch: LEGEND_SWATCH.booked },
    { key: "blocked", label: t("blocked"), swatch: LEGEND_SWATCH.blocked },
    { key: "past", label: t("past"), swatch: LEGEND_SWATCH.past },
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
