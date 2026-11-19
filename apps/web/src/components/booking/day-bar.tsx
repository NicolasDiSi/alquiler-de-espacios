"use client";

import type { DaySlot, SlotState } from "@espacios/domain";
import { cn } from "cn";
import { useTranslations } from "next-intl";

import { timeOf } from "@/lib/bookings/search";

/** One class per state; the bar's label says the same in words, so the state is never color alone. */
export const SLOT_FILL: Record<SlotState, string> = {
  free: "bg-chart-2/20",
  booked: "bg-muted-foreground/45",
  mine: "bg-primary/60",
  blocked: "bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_6px)] opacity-60",
  past: "bg-muted",
};

type Run = { readonly state: SlotState; readonly start: number; readonly end: number };

function runsOf(slots: readonly DaySlot[]): Run[] {
  const runs: Run[] = [];
  for (const slot of slots) {
    const last = runs.at(-1);
    if (last && last.state === slot.state && last.end === slot.start)
      runs[runs.length - 1] = { ...last, end: slot.end };
    else runs.push({ state: slot.state, start: slot.start, end: slot.end });
  }
  return runs;
}

/**
 * A room's day as one track from opening to closing (spec 0008): busy, own, blocked and past time as segments over the
 * free track, the chosen window as a marker. Read by a screen reader as one sentence listing what is not free.
 */
export function DayBar({
  room,
  slots,
  opensAt,
  closesAt,
  window,
  selected,
}: {
  readonly room: string;
  readonly slots: readonly DaySlot[];
  readonly opensAt: number;
  readonly closesAt: number;
  readonly window: { readonly start: number; readonly end: number } | null;
  readonly selected: boolean;
}) {
  const t = useTranslations("booking");
  const span = Math.max(1, closesAt - opensAt);
  const at = (minutes: number) => `${((minutes - opensAt) / span) * 100}%`;
  const width = (start: number, end: number) => `${((end - start) / span) * 100}%`;
  const busy = runsOf(slots).filter((run) => run.state !== "free");
  const spans = busy
    .map((run) =>
      t("bar.span", { state: t(`timeline.legend.${run.state}`), start: timeOf(run.start), end: timeOf(run.end) }),
    )
    .join("; ");

  return (
    <div
      role="img"
      aria-label={t("bar.label", { room, spans: spans || t("bar.allFree") })}
      className={cn("relative h-8 w-full overflow-hidden rounded-md", SLOT_FILL.free)}
    >
      {busy.map((run) => (
        <span
          key={run.start}
          className={cn("absolute inset-y-0", SLOT_FILL[run.state])}
          style={{ left: at(run.start), width: width(run.start, run.end) }}
        />
      ))}
      {window ? (
        <span
          className={cn(
            "border-primary absolute inset-y-0.5 rounded-sm border-2",
            selected ? "bg-primary" : "bg-primary/15",
          )}
          style={{ left: at(window.start), width: width(window.start, window.end) }}
        />
      ) : null}
    </div>
  );
}
