import type { ClientActivity } from "@espacios/application";
import { cn } from "cn";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { weekdayKey } from "@/lib/operator/format";
import { formatDecimalHours, formatHours } from "@/lib/operator/metric-format";

/**
 * The client's booked hours per weekday of the period (spec 0007, AC-2), as bars with the hours written on top and the
 * busiest day marked by color and by its words. A list, so a screen reader reads each day with its hours.
 */
export async function WeeklyPattern({ activity }: { readonly activity: ClientActivity }) {
  const t = await getTranslations("operator.client.activity.weekly");
  const days = await getTranslations("operator.weekdays");
  const none = (await getTranslations("operator.dashboard"))("none");
  const max = Math.max(...activity.weekdays.map((day) => day.bookedMinutes), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description", { days: activity.period })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="bg-muted/40 grid auto-cols-fr grid-flow-col gap-2 rounded-lg p-3">
          {activity.weekdays.map((day) => {
            const peak = day.weekday === activity.peakWeekday;
            const height = max > 0 ? Math.max(4, (day.bookedMinutes / max) * 100) : 4;
            return (
              <li key={day.weekday} className="flex flex-col items-center gap-2">
                <span className={cn("text-sm tabular-nums", peak && "text-primary font-semibold")}>
                  {formatHours(day.bookedMinutes)}
                </span>
                <div className="bg-muted flex h-28 w-full items-end overflow-hidden rounded-md">
                  <div
                    aria-hidden
                    className={cn("w-full rounded-md", peak ? "bg-primary" : "bg-primary/25")}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className={cn("text-xs", peak ? "text-primary font-medium" : "text-muted-foreground")}>
                  {days(`long.${weekdayKey(day.weekday)}`)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="text-muted-foreground flex flex-wrap justify-between gap-2 border-t pt-3 text-xs">
          <p>
            {t("peak")}{" "}
            <span className="text-foreground font-medium">
              {activity.peakWeekday === null ? none : days(`long.${weekdayKey(activity.peakWeekday)}`)}
            </span>
          </p>
          <p>
            {t("mean")}{" "}
            <span className="text-foreground font-medium">
              {activity.totals.meanMinutes === null ? none : formatDecimalHours(activity.totals.meanMinutes / 60)}
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
