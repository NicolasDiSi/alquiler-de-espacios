import type { OperatorDashboard } from "@espacios/application";
import type { HeatmapCell } from "@espacios/domain";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { HEATMAP_STEPS, MatrixHeatmap } from "@/components/charts/matrix-heatmap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WEEKDAYS_MONDAY_FIRST, weekdayKey } from "@/lib/operator/format";

import { formatWholePercent, pad } from "./format";

/**
 * Weekday by hour occupancy of the period over every facility (spec 0004, AC-13), with its busiest and emptiest cell. A
 * cell where no room was open shows a dash; a cell under 20% is also listed in the recommendations.
 */
export async function OccupancyHeatmap({ heatmap }: { heatmap: OperatorDashboard["heatmap"] }) {
  const t = await getTranslations("operator.dashboard.heatmap");
  const tDays = await getTranslations("operator.weekdays");
  const none = (await getTranslations("operator.dashboard"))("none");

  const hours = [...new Set(heatmap.cells.map((cell) => cell.hour))].sort((a, b) => a - b);
  const weekdays = WEEKDAYS_MONDAY_FIRST.filter((day) => heatmap.cells.some((cell) => cell.weekday === day));
  const valueAt = (weekday: number, hour: number) =>
    heatmap.cells.find((cell) => cell.weekday === weekday && cell.hour === hour)?.occupancy ?? null;

  const slot = (cell: HeatmapCell) =>
    t("slot", { weekday: tDays(`long.${weekdayKey(cell.weekday)}`), from: pad(cell.hour), to: pad(cell.hour + 1) });
  const extremes = [
    { key: "peak", icon: TrendingUp, cell: heatmap.peak },
    { key: "low", icon: TrendingDown, cell: heatmap.low },
  ] as const;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {weekdays.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <MatrixHeatmap
                caption={t("caption")}
                className="min-w-[32rem]"
                columns={hours.map((hour) => `${pad(hour)}:00`)}
                rows={weekdays.map((day) => ({
                  label: tDays(`short3.${weekdayKey(day)}`),
                  values: hours.map((hour) => valueAt(day, hour)),
                }))}
                formatCell={(value) => String(Math.round(value * 100))}
                emptyCell={none}
                legendLabel={t("legend")}
                legendSteps={Array.from({ length: HEATMAP_STEPS }, (_, step) =>
                  [formatWholePercent(step / HEATMAP_STEPS), formatWholePercent((step + 1) / HEATMAP_STEPS)].join(
                    " – ",
                  ),
                )}
              />
            </div>
            <dl className="mt-auto grid gap-2 border-t pt-3 text-xs sm:grid-cols-2">
              {extremes.map(({ key, icon: Icon, cell }) => (
                <div key={key} className="flex items-center gap-2">
                  <Icon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
                  <dt className="text-muted-foreground">{t(key)}</dt>
                  <dd>
                    {cell && cell.occupancy !== null ? (
                      <>
                        <span className="font-medium">{slot(cell)}</span>{" "}
                        <span className="text-muted-foreground tabular-nums">
                          ({formatWholePercent(cell.occupancy)})
                        </span>
                      </>
                    ) : (
                      none
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
