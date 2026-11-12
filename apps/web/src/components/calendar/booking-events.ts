import type { BusySpan } from "@espacios/domain";
import type { EventInput } from "@fullcalendar/react";

/**
 * How booking time reads in every room calendar (`/salas` and `/salas/[id]`), one look per state so the legend means
 * the same everywhere. Free time is the card's white and the only thing that reacts to the pointer; the user's own
 * selection is the one solid accent; busy time is quiet (a tint with a left rule), and time that cannot be booked
 * (already started, outside the horizon) is hatched, and blocked time is a dashed outline. Color is never the only cue: every
 * event says its state in words and the legend repeats it.
 */

/** Diagonal stripes in the input border token, only on surfaces without text (they would cut through the letters). */
export const HATCH = "bg-[repeating-linear-gradient(135deg,transparent_0_7px,var(--input)_7px_8px)]";

export type BusyState = "booked" | "mine" | "blocked";

/**
 * Theme tokens only, each pair checked for contrast: foreground on muted (15:1), primary on secondary (6.4:1),
 * muted-foreground on muted (6.4:1), primary-foreground on primary (7.2:1). The `input` border (3.7:1 on the card)
 * outlines every block so it never relies on a fill a few steps from white.
 */
export const BUSY_LOOK = {
  booked: {
    color: "var(--muted)",
    contrastColor: "var(--foreground)",
    classNames: ["border-input!", "border-s-4!", "border-s-muted-foreground!"],
  },
  mine: {
    color: "var(--secondary)",
    contrastColor: "var(--primary)",
    classNames: ["border-primary!", "border-s-4!"],
  },
  blocked: {
    color: "var(--muted)",
    contrastColor: "var(--muted-foreground)",
    classNames: ["border-dashed!", "border-input!"],
  },
} as const satisfies Record<BusyState, Pick<EventInput, "color" | "contrastColor" | "classNames">>;

/** The range being booked: the one solid accent on the grid. */
export const DRAFT_LOOK = {
  color: "var(--primary)",
  contrastColor: "var(--primary-foreground)",
  classNames: ["shadow-md"],
} as const satisfies Pick<EventInput, "color" | "contrastColor" | "classNames">;

/** Background for time that can no longer be booked: muted and hatched, no text on it. */
export const UNAVAILABLE_LOOK = {
  display: "background",
  color: "var(--muted)",
  classNames: ["bg-muted!", HATCH, "cursor-not-allowed"],
} as const satisfies Pick<EventInput, "display" | "color" | "classNames">;

/** Blocked by the operator first, then the company's own booking, then someone else's. */
export const busyStateOf = (span: BusySpan): BusyState => {
  if (span.kind === "blocked") return "blocked";
  return span.mine ? "mine" : "booked";
};
