import type { ReactNode } from "react";

import type { OperatorDashboard } from "@espacios/application";
import { cn } from "cn";
import {
  CalendarCheck,
  CalendarX,
  ChartPie,
  Clock,
  type LucideIcon,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

import { formatDecimal, formatDecimalHours, formatHours, formatInteger, formatPercent, signOf } from "./format";

/** Changes smaller than this read as flat. */
const FLAT = 0.001;

type Delta = { text: string; trend: "up" | "down" | "flat"; favorable: boolean | null };
type Detail = { label: string; value: string };
type Kpi = { id: string; icon: LucideIcon; label: string; value: string; delta: Delta | null; details: Detail[] };

const TREND_ICONS = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

function delta(change: number | null, text: (change: number) => string, higherIsBetter: boolean): Delta | null {
  if (change === null) return null;
  let trend: Delta["trend"] = change > 0 ? "up" : "down";
  if (Math.abs(change) < FLAT) trend = "flat";
  return { text: text(change), trend, favorable: trend === "flat" ? null : (trend === "up") === higherIsBetter };
}

function DeltaBadge({ delta, none }: { delta: Delta | null; none: string }) {
  if (!delta) return <Badge variant="outline">{none}</Badge>;
  const Icon = TREND_ICONS[delta.trend];
  return (
    <Badge
      variant="outline"
      className={cn(
        delta.favorable === true && "border-success/30 bg-success/10 text-success",
        delta.favorable === false && "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <Icon aria-hidden />
      {delta.text}
    </Badge>
  );
}

/**
 * The period's four indicators in a two by two grid, beside the daily occupancy chart (`children`), in one surface (the
 * template's layout). Each value against the previous window of the same length; a dash when it cannot be measured.
 */
export async function KpiStrip({ dashboard, children }: { dashboard: OperatorDashboard; children: ReactNode }) {
  const t = await getTranslations("operator.dashboard");
  const { totals, changes } = dashboard;
  const none = t("none");
  const bookedHours = totals.bookedMinutes / 60;
  const points = (change: number) =>
    t("delta.points", { sign: signOf(change), value: formatDecimal(Math.abs(change) * 100) });
  const relative = (change: number) => `${signOf(change)}${formatPercent(Math.abs(change))}`;

  const kpis: Kpi[] = [
    {
      id: "occupancy",
      icon: ChartPie,
      label: t("kpis.occupancy.label"),
      value: totals.occupancy === null ? none : formatPercent(totals.occupancy),
      delta: delta(changes.occupancy, points, true),
      details: [{ label: t("kpis.occupancy.openHours"), value: formatHours(totals.openMinutes) }],
    },
    {
      id: "booked-hours",
      icon: Clock,
      label: t("kpis.bookedHours.label"),
      value: formatHours(totals.bookedMinutes),
      delta: delta(changes.bookedMinutes, relative, true),
      details: [
        {
          label: t("kpis.bookedHours.dailyAverage"),
          value: totals.openDays > 0 ? formatDecimalHours(bookedHours / totals.openDays) : none,
        },
        {
          label: t("kpis.bookedHours.meanDuration"),
          value: totals.confirmed > 0 ? formatDecimalHours(bookedHours / totals.confirmed) : none,
        },
      ],
    },
    {
      id: "bookings",
      icon: CalendarCheck,
      label: t("kpis.bookings.label"),
      value: formatInteger(totals.confirmed),
      delta: delta(changes.confirmed, relative, true),
      details: [
        {
          label: t("kpis.bookings.perDay"),
          value: totals.openDays > 0 ? formatDecimal(totals.confirmed / totals.openDays) : none,
        },
      ],
    },
    {
      id: "cancellations",
      icon: CalendarX,
      label: t("kpis.cancellations.label"),
      value: totals.cancellationRate === null ? none : formatPercent(totals.cancellationRate),
      delta: delta(changes.cancellationRate, points, false),
      details: [{ label: t("kpis.cancellations.cancelled"), value: formatInteger(totals.cancelled) }],
    },
  ];
  const comparison = t("period.comparison", { days: dashboard.period });

  return (
    <section
      aria-label={t("kpis.label")}
      className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1"
    >
      <div className="grid grid-cols-1 xl:grid-cols-12">
        <div className="grid grid-cols-1 border-b md:grid-cols-2 xl:col-span-6 xl:border-r xl:border-b-0">
          {kpis.map((kpi, index) => {
            const Icon = kpi.icon;
            return (
              <Card
                key={kpi.id}
                className={cn(
                  "rounded-none shadow-none ring-0",
                  index % 2 === 0 && "md:border-r",
                  // Lines between rows only: one column below md, two from md.
                  index < kpis.length - 1 && "border-b",
                  index >= kpis.length - 2 && "md:border-b-0",
                )}
              >
                <CardHeader>
                  <CardDescription>{kpi.label}</CardDescription>
                  <CardAction>
                    <Icon aria-hidden className="text-muted-foreground size-4" />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <p className="text-3xl leading-none tracking-tight tabular-nums">{kpi.value}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <DeltaBadge delta={kpi.delta} none={t("delta.none")} />
                      <span className="text-muted-foreground text-xs">{comparison}</span>
                    </div>
                  </div>
                  <dl className="mt-auto flex flex-col gap-1 border-t pt-3 text-xs">
                    {kpi.details.map((detail) => (
                      <div key={detail.label} className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">{detail.label}</dt>
                        <dd className="text-right tabular-nums">{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="xl:col-span-6">{children}</div>
      </div>
    </section>
  );
}
