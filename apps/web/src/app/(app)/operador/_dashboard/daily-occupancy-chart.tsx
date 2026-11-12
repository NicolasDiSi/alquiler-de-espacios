"use client";

import { useId } from "react";

import type { OperatorDashboard } from "@espacios/application";
import type { DayRange } from "@espacios/domain";
import { useTranslations } from "next-intl";
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceArea, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatDay, formatHours, formatMonth, formatPercent, formatWholePercent } from "@/lib/operator/metric-format";

type Point = {
  date: string;
  /** For the tooltip, for example "mié, 14 oct". */
  day: string;
  /** Month name on the first open day of each month, empty otherwise. For the axis. */
  monthTick: string;
  bookedMinutes: number;
  /** Percent, 0 to 100, so both series share one hidden scale. */
  occupancy: number;
  trend: number;
};

/**
 * Occupancy on each open day of the last 90 days: faint bars per day, a line for the five day mean, and the selected
 * period shaded. The figures come from the server; this only draws them.
 */
export function DailyOccupancyChart({ daily, highlight }: { daily: OperatorDashboard["daily"]; highlight: DayRange }) {
  const t = useTranslations("operator.dashboard.daily");
  // SVG ids must be unique on the page and valid inside url(#...).
  const glowId = `daily-occupancy-glow-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const chartConfig = {
    trend: { label: t("trend"), color: "var(--foreground)" },
    occupancy: { label: t("occupancy"), color: "var(--muted-foreground)" },
  } satisfies ChartConfig;

  const points: Point[] = daily.days.map((day, index) => ({
    date: day.date,
    day: formatDay(day.date),
    monthTick: daily.days[index - 1]?.date.slice(0, 7) === day.date.slice(0, 7) ? "" : formatMonth(day.date),
    bookedMinutes: day.bookedMinutes,
    occupancy: day.occupancy * 100,
    trend: day.trend * 100,
  }));
  const values = points.map((point) => point.occupancy);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const firstInPeriod = points.find((point) => point.date >= highlight.from);
  const shaded = firstInPeriod && firstInPeriod.date !== points[0]?.date ? firstInPeriod.date : null;

  return (
    <Card className="h-full rounded-none shadow-none ring-0">
      <CardHeader>
        <CardTitle className="font-normal">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        {points.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ChartContainer
            aria-label={t("summary", {
              days: points.length,
              min: formatWholePercent(Math.min(...values) / 100),
              max: formatWholePercent(Math.max(...values) / 100),
              mean: formatPercent(mean / 100),
            })}
            role="figure"
            className="aspect-auto h-74 w-full"
            config={chartConfig}
          >
            <ComposedChart data={points} margin={{ bottom: 0, left: 0, right: 0, top: 0 }}>
              <defs>
                <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feFlood floodColor="var(--color-trend)" floodOpacity="0.35" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge>
                    <feMergeNode />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="date"
                height={30}
                interval={0}
                minTickGap={0}
                tick={{ fontSize: 10 }}
                tickFormatter={(value: string) => points.find((point) => point.date === value)?.monthTick ?? ""}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis domain={[0, 100]} hide />
              {shaded && <ReferenceArea fill="var(--muted)" fillOpacity={0.6} x1={shaded} x2={highlight.to} />}
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-44"
                    labelFormatter={(_, payload) => {
                      const point = payload[0]?.payload as Point | undefined;
                      return point ? t("tooltip", { day: point.day, hours: formatHours(point.bookedMinutes) }) : "";
                    }}
                    formatter={(value, name, item) => (
                      <>
                        <div className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                        <div className="flex flex-1 items-center justify-between leading-none">
                          <span className="text-muted-foreground">
                            {chartConfig[name as keyof typeof chartConfig]?.label ?? String(name)}
                          </span>
                          <span className="text-foreground font-mono font-medium tabular-nums">
                            {typeof value === "number" ? formatPercent(value / 100) : String(value ?? "")}
                          </span>
                        </div>
                      </>
                    )}
                  />
                }
                cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
              />
              <Bar barSize={4} dataKey="occupancy" fill="var(--color-occupancy)" opacity={0.3} radius={[4, 4, 0, 0]} />
              <Area
                activeDot={{ r: 4, fill: "var(--background)", stroke: "var(--color-trend)", strokeWidth: 2 }}
                dataKey="trend"
                dot={false}
                fill="none"
                filter={`url(#${glowId})`}
                stroke="var(--color-trend)"
                strokeWidth={1.8}
                type="linear"
              />
              <ChartLegend content={<ChartLegendContent />} verticalAlign="top" />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
