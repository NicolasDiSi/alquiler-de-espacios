"use client";

import type { DashboardRoom } from "@espacios/application";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatHours, formatPercent, formatWholePercent } from "@/lib/operator/metric-format";

type Datum = DashboardRoom & {
  /** Percent, 0 to 100, so the bars and their labels share a scale. */
  usage: number;
};

/** Occupancy of each room open in the period, busiest first, with high and low demand named in the tooltip. */
export function RoomUsageChart({ rooms }: { rooms: readonly DashboardRoom[] }) {
  const t = useTranslations("operator.dashboard.rooms");
  const chartConfig = { usage: { label: t("usage"), color: "var(--primary)" } } satisfies ChartConfig;
  const data: Datum[] = rooms.map((room) => ({ ...room, usage: room.occupancy * 100 }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        {data.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ChartContainer
            aria-label={t("summary", {
              list: rooms.map((room) => `${room.name} ${formatPercent(room.occupancy)}`).join(", "),
            })}
            role="figure"
            className="aspect-auto h-72 w-full"
            config={chartConfig}
          >
            <BarChart data={data} margin={{ top: 24, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis axisLine={false} dataKey="name" interval={0} tickLine={false} tickMargin={8} />
              <YAxis domain={[0, 100]} hide />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    className="w-48"
                    hideIndicator
                    labelFormatter={(_, payload) => (payload[0]?.payload as Datum | undefined)?.name}
                    formatter={(_value, _name, item) => {
                      const datum = item.payload as Datum;
                      const rows = [
                        { label: t("usage"), value: formatPercent(datum.occupancy) },
                        { label: t("booked"), value: formatHours(datum.bookedMinutes) },
                        { label: t("open"), value: formatHours(datum.openMinutes) },
                      ];
                      return (
                        <div className="flex w-full flex-col gap-1">
                          <span className="text-muted-foreground">{datum.facilityName}</span>
                          {rows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{row.label}</span>
                              <span className="text-foreground font-mono font-medium tabular-nums">{row.value}</span>
                            </div>
                          ))}
                          {datum.demand !== "normal" && (
                            <span className="text-foreground font-medium">{t(`demand.${datum.demand}`)}</span>
                          )}
                        </div>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey="usage" fill="var(--color-usage)" maxBarSize={48} radius={[4, 4, 0, 0]}>
                <LabelList
                  className="fill-foreground"
                  dataKey="usage"
                  fontSize={12}
                  formatter={(value: unknown) => (typeof value === "number" ? formatWholePercent(value / 100) : "")}
                  offset={8}
                  position="top"
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
