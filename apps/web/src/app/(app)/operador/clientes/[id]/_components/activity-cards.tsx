import type { ReactNode } from "react";

import type { ClientActivity } from "@espacios/application";
import { CalendarCheck, Clock, type LucideIcon, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  formatDecimal,
  formatDecimalHours,
  formatHours,
  formatInteger,
  formatPercent,
  signOf,
} from "@/lib/operator/metric-format";

import { DeltaBadge, delta } from "../../../_components/delta-badge";

function ActivityCard({
  label,
  icon: Icon,
  children,
}: {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <Icon aria-hidden className="text-muted-foreground size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

/**
 * The client's period in three cards (spec 0007, AC-1): hours and their share of every company's hours, bookings done,
 * upcoming and cancelled with the rate, and the room it uses most. Each figure against the previous window where it
 * has one; a dash when there is nothing to measure.
 */
export async function ActivityCards({ activity }: { readonly activity: ClientActivity }) {
  const t = await getTranslations("operator.client.activity.cards");
  const none = (await getTranslations("operator.dashboard"))("none");
  const comparison = (await getTranslations("operator.dashboard.period"))("comparison", { days: activity.period });
  const tDelta = await getTranslations("operator.dashboard.delta");
  const noBase = tDelta("none");
  const { totals, changes, preferredRoom } = activity;
  const relative = (change: number) => `${signOf(change)}${formatPercent(Math.abs(change))}`;
  const points = (change: number) =>
    tDelta("points", { sign: signOf(change), value: formatDecimal(Math.abs(change) * 100) });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ActivityCard label={t("hours.label")} icon={Clock}>
        <p className="text-3xl leading-none tracking-tight tabular-nums">{formatHours(totals.bookedMinutes)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <DeltaBadge delta={delta(changes.bookedMinutes, relative, true)} none={noBase} />
          <span className="text-muted-foreground text-xs">{comparison}</span>
        </div>
        <div className="mt-auto flex flex-col gap-1.5 border-t pt-3 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">{t("hours.share")}</span>
            <span className="tabular-nums">{totals.share === null ? none : formatPercent(totals.share)}</span>
          </div>
          <Progress aria-label={t("hours.share")} className="h-1.5" value={(totals.share ?? 0) * 100} />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">{t("hours.mean")}</span>
            <span className="tabular-nums">
              {totals.meanMinutes === null ? none : formatDecimalHours(totals.meanMinutes / 60)}
            </span>
          </div>
        </div>
      </ActivityCard>

      <ActivityCard label={t("bookings.label")} icon={CalendarCheck}>
        <p className="text-3xl leading-none tracking-tight tabular-nums">
          {formatInteger(totals.confirmed)}
          <span className="text-muted-foreground ml-2 text-base">{t("bookings.done")}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <DeltaBadge delta={delta(changes.confirmed, relative, true)} none={noBase} />
          <span className="text-muted-foreground text-xs">{comparison}</span>
        </div>
        <dl className="mt-auto flex flex-col gap-1 border-t pt-3 text-xs">
          {(
            [
              { key: "upcoming", value: formatInteger(totals.upcoming), dot: "bg-info" },
              { key: "cancelled", value: formatInteger(totals.cancelled), dot: "bg-destructive" },
              {
                key: "rate",
                value: totals.cancellationRate === null ? none : formatPercent(totals.cancellationRate),
                dot: null,
              },
            ] as const satisfies readonly {
              key: "upcoming" | "cancelled" | "rate";
              value: string;
              dot: string | null;
            }[]
          ).map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground flex items-center gap-1.5">
                {row.dot ? <span aria-hidden className={`size-2 rounded-full ${row.dot}`} /> : null}
                {t(`bookings.${row.key}`)}
              </dt>
              <dd className="text-right tabular-nums">
                {row.value}
                {row.key === "rate" ? (
                  <span className="text-muted-foreground ml-1">
                    ({changes.cancellationRate === null ? none : points(changes.cancellationRate)})
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </ActivityCard>

      <ActivityCard label={t("room.label")} icon={Star}>
        {preferredRoom ? (
          <>
            <div className="space-y-1">
              <p className="text-lg leading-tight font-medium">{preferredRoom.name}</p>
              <p className="text-muted-foreground text-xs">{preferredRoom.facilityName}</p>
            </div>
            <div className="mt-auto flex items-baseline justify-between gap-3 border-t pt-3 text-xs">
              <span className="text-muted-foreground">{t("room.share")}</span>
              <span className="text-primary text-base font-medium tabular-nums">
                {preferredRoom.share === null ? none : formatPercent(preferredRoom.share)}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              {t("room.hours", { hours: formatHours(preferredRoom.bookedMinutes) })}
            </p>
          </>
        ) : (
          <>
            <p className="text-3xl leading-none">{none}</p>
            <p className="text-muted-foreground mt-auto text-xs">{t("room.empty")}</p>
          </>
        )}
      </ActivityCard>
    </div>
  );
}
