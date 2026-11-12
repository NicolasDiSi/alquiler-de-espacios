import { cn } from "cn";
import { useTranslations } from "next-intl";

import { WEEKDAYS_MONDAY_FIRST, weekdayKey } from "@/lib/operator/format";

/**
 * The open days of a sede as seven letters, Monday first: open ones filled, closed ones faint. The same reading as the
 * week on the sede's page, small enough for a table cell. Screen readers get the day names.
 */
export function WeekDays({ open }: { readonly open: readonly number[] }) {
  const days = useTranslations("operator.weekdays");
  return (
    <span className="inline-flex items-center gap-0.5">
      {WEEKDAYS_MONDAY_FIRST.map((day) => (
        <span
          key={day}
          aria-hidden
          className={cn(
            "flex size-5 items-center justify-center rounded text-[11px] leading-none font-medium",
            open.includes(day) ? "bg-secondary text-primary" : "text-muted-foreground/60",
          )}
        >
          {days(`short.${weekdayKey(day)}`)}
        </span>
      ))}
      <span className="sr-only">{open.map((day) => days(`long.${weekdayKey(day)}`)).join(", ")}</span>
    </span>
  );
}
