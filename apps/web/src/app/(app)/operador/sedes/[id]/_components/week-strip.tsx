import type { DayStretch, OperatorWeekView } from "@espacios/application";
import { cn } from "cn";
import { useFormatter, useTranslations } from "next-intl";

import { markOfMinutes, weekdayKey } from "@/lib/operator/format";

const DAY = 1440;
const TICKS = [0, 360, 720, 1080, 1440];

/** Where a stretch sits on a day's track, as percentages. */
const place = ({ from, to }: DayStretch) => ({
  left: `${(from / DAY) * 100}%`,
  width: `${((to - from) / DAY) * 100}%`,
});

/**
 * This week at the sede (spec 0005): one track per day from midnight to midnight, the opening window filled, active
 * blocks hatched over it, and a line at the current time on today. The tracks are a picture; each day says the same
 * in words for screen readers.
 */
export function WeekStrip({ week, timeZone }: { readonly week: OperatorWeekView; readonly timeZone: string }) {
  const t = useTranslations("operator.week");
  const days = useTranslations("operator.weekdays");
  const format = useFormatter();
  const dayLabel = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { day: "numeric", month: "numeric", timeZone: "UTC" });

  return (
    <figure className="bg-card rounded-lg border p-4 shadow-sm">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{t("title")}</span>
        <span className="text-muted-foreground flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="bg-primary/25 size-3 rounded-sm" />
            {t("legendOpen")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-3 rounded-sm bg-[repeating-linear-gradient(135deg,var(--info)_0_2px,transparent_2px_5px)]"
            />
            {t("legendBlocked")}
          </span>
        </span>
      </figcaption>

      <div aria-hidden className="text-muted-foreground mb-1 ml-20 grid grid-cols-4 text-[11px] tabular-nums">
        {TICKS.slice(0, -1).map((tick) => (
          <span key={tick}>{markOfMinutes(tick)}</span>
        ))}
      </div>

      <ol className="flex flex-col gap-1.5">
        {week.days.map((day) => {
          const name = days(`long.${weekdayKey(day.weekday)}`);
          const spoken = day.open
            ? t("openFromTo", { from: markOfMinutes(day.open.from), to: markOfMinutes(day.open.to) })
            : t("closed");
          const blocked = day.blocked.map((stretch) =>
            t("blockedFromTo", {
              from: markOfMinutes(stretch.from),
              to: markOfMinutes(stretch.to),
              room: stretch.room ?? t("wholeFacility"),
            }),
          );
          return (
            <li key={day.date} className="flex items-center gap-3">
              <span
                className={cn(
                  "w-17 shrink-0 text-sm tabular-nums",
                  day.isToday ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {days(`short3.${weekdayKey(day.weekday)}`)} {dayLabel(day.date)}
              </span>
              <span className="sr-only">
                {[name, day.isToday ? t("today") : null, spoken, ...blocked].filter(Boolean).join(". ")}
              </span>
              <span aria-hidden className="bg-muted relative h-6 flex-1 overflow-hidden rounded-md">
                {TICKS.slice(1, -1).map((tick) => (
                  <span
                    key={tick}
                    className="bg-border absolute inset-y-0 w-px"
                    style={{ left: `${(tick / DAY) * 100}%` }}
                  />
                ))}
                {day.open ? (
                  <span className="bg-primary/25 absolute inset-y-0 flex items-center" style={place(day.open)}>
                    <span className="text-primary relative z-10 truncate px-2 text-[11px] font-medium tabular-nums">
                      {markOfMinutes(day.open.from)}–{markOfMinutes(day.open.to)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground absolute inset-0 flex items-center px-2 text-[11px]">
                    {t("closed")}
                  </span>
                )}
                {day.blocked.map((stretch) => (
                  <span
                    key={`${stretch.from}-${stretch.to}-${stretch.room ?? ""}`}
                    className="absolute inset-y-0 border-x border-[var(--info)] bg-[repeating-linear-gradient(135deg,var(--info)_0_2px,transparent_2px_6px)] opacity-70"
                    style={place(stretch)}
                  />
                ))}
                {day.isToday ? (
                  <span
                    className="bg-foreground absolute inset-y-0 w-0.5"
                    style={{ left: `${(week.nowMinutes / DAY) * 100}%` }}
                  />
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-muted-foreground mt-3 text-xs">{t("zone", { zone: timeZone })}</p>
    </figure>
  );
}
