import Link from "next/link";

import { cn } from "cn";
import { getTranslations } from "next-intl/server";

import { CALENDARIO, type PageVista, VISTAS } from "@/lib/bookings/views";

/** The three lists and the calendar as links styled as tabs (spec 0003): each is a URL rendered on the server. */
export async function ViewTabs({ current }: { current: PageVista }) {
  const t = await getTranslations("home");

  return (
    <nav aria-label={t("viewsLabel")} className="border-b">
      <ul className="-mb-px flex gap-1">
        {[...Object.entries(VISTAS), [CALENDARIO, "calendar"] as const].map(([vista, view]) => {
          const active = vista === current;
          return (
            <li key={vista}>
              <Link
                href={`/?vista=${vista}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-3",
                  active
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t(`views.${view}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
