import Link from "next/link";

import type { DayRange } from "@espacios/domain";
import { cn } from "cn";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { formatDateRange } from "./format";
import { PERIODOS, type Periodo, periodoHref } from "./period";

/**
 * The period as links shaped like a segmented toggle (as the Mis reservas tabs): each one is a URL the server renders, so
 * only the active period is read. The dates it covers sit beside it.
 */
export async function PeriodPicker({ current, range }: { current: Periodo; range: DayRange }) {
  const t = await getTranslations("operator.dashboard.period");

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <nav aria-label={t("label")}>
        <ul className="flex">
          {(Object.keys(PERIODOS) as Periodo[]).map((periodo, index, all) => {
            const active = periodo === current;
            return (
              <li key={periodo} className="-ml-px first:ml-0">
                <Link
                  href={periodoHref(periodo)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring/50 relative inline-flex h-8 items-center border px-3 text-xs font-medium outline-none focus-visible:z-10 focus-visible:ring-3",
                    index === 0 && "rounded-l-md",
                    index === all.length - 1 && "rounded-r-md",
                    active ? "bg-accent text-accent-foreground" : "bg-background hover:bg-muted text-muted-foreground",
                  )}
                >
                  {t(`options.${periodo}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <CalendarDays aria-hidden className="size-3.5" />
        {formatDateRange(range.from, range.to)}
      </span>
    </div>
  );
}
