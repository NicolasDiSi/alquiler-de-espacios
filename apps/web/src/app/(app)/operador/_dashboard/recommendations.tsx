import Link from "next/link";

import type { Insights } from "@espacios/application";
import { cn } from "cn";
import { Hourglass, type LucideIcon, TriangleAlert, UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { weekdayKey } from "@/lib/operator/format";
import { formatHours, formatWholePercent, pad } from "@/lib/operator/metric-format";

type Kind = "idle" | "lowUse" | "cancellations";

// Each kind carries an icon and a label, so the tone never relies on color alone.
const KIND_STYLES: Record<Kind, { icon: LucideIcon; className: string }> = {
  cancellations: { icon: TriangleAlert, className: "text-warning" },
  lowUse: { icon: UserX, className: "text-muted-foreground" },
  idle: { icon: Hourglass, className: "text-muted-foreground" },
};

type Recommendation = {
  key: string;
  kind: Kind;
  title: string;
  detail: string;
  impact: string;
  action: { label: string; href: string };
};

/**
 * What the period suggests (spec 0004, AC-14): the clients worth a call first (no bookings, low usage, frequent
 * cancellations), then the emptiest weekday and hour slots of each sede. Each one leads to the page where you act on it.
 */
export async function Recommendations({ insights }: { insights: Insights }) {
  const t = await getTranslations("operator.dashboard.recommendations");
  const tDays = await getTranslations("operator.weekdays");

  const items: Recommendation[] = [
    ...insights.promotionCandidates.map(
      (candidate): Recommendation => ({
        key: `client-${candidate.company.id}`,
        kind: candidate.reasons.includes("high_cancellation") ? "cancellations" : "lowUse",
        title: candidate.company.name,
        // "No bookings" already says "low usage"; showing both reads as a contradiction.
        detail: candidate.reasons
          .filter((reason) => reason !== "low_usage" || !candidate.reasons.includes("no_bookings"))
          .map((reason) => t(`reasons.${reason}`))
          .join(". "),
        impact: t("candidate.detail", {
          hours: formatHours(candidate.bookedHours * 60),
          confirmed: candidate.confirmedCount,
          cancelled: candidate.cancelledCount,
        }),
        action: { label: t("candidate.action"), href: `/operador/clientes/${candidate.company.id}` },
      }),
    ),
    ...insights.lowUtilizationSlots.map(
      (slot): Recommendation => ({
        key: `slot-${slot.facility.id}-${slot.weekday}-${slot.hour}`,
        kind: "idle",
        title: t("slot.title", {
          facility: slot.facility.name,
          weekday: tDays(`long.${weekdayKey(slot.weekday)}`),
          from: pad(slot.hour),
          to: pad(slot.hour + 1),
        }),
        detail: t("slot.detail", { occupancy: formatWholePercent(slot.occupancy) }),
        impact: "",
        action: { label: t("slot.action"), href: `/operador/sedes/${slot.facility.id}` },
      }),
    ),
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 shrink">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const style = KIND_STYLES[item.kind];
              const Icon = style.icon;
              return (
                <li key={item.key} className="flex">
                  <Item className="w-full" variant="outline">
                    <ItemMedia className={style.className} variant="icon">
                      <Icon aria-hidden />
                    </ItemMedia>
                    <ItemContent>
                      <span className="text-muted-foreground text-xs font-medium">{t(`kinds.${item.kind}`)}</span>
                      <ItemTitle className="line-clamp-none">{item.title}</ItemTitle>
                      <ItemDescription className="line-clamp-none text-xs">{item.detail}</ItemDescription>
                    </ItemContent>
                    <ItemFooter className={cn("flex-wrap border-t pt-2.5", !item.impact && "justify-end")}>
                      {item.impact ? <span className="text-muted-foreground text-xs">{item.impact}</span> : null}
                      <ItemActions>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={item.action.href}>{item.action.label}</Link>
                        </Button>
                      </ItemActions>
                    </ItemFooter>
                  </Item>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
