import { cn } from "cn";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** Changes smaller than this read as flat. */
const FLAT = 0.001;

export type Delta = { text: string; trend: "up" | "down" | "flat"; favorable: boolean | null };

const TREND_ICONS = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

/** A change against the previous window, written by `text`, good news when it moves the way `higherIsBetter` says. */
export function delta(change: number | null, text: (change: number) => string, higherIsBetter: boolean): Delta | null {
  if (change === null) return null;
  let trend: Delta["trend"] = change > 0 ? "up" : "down";
  if (Math.abs(change) < FLAT) trend = "flat";
  return { text: text(change), trend, favorable: trend === "flat" ? null : (trend === "up") === higherIsBetter };
}

/** The change as a badge: the icon and the sign carry the direction, the color only says whether it is good news. */
export function DeltaBadge({ delta, none }: { delta: Delta | null; none: string }) {
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
