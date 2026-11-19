import type { BusySpan } from "@espacios/domain";
import type { CalendarOptions, EventInput } from "@fullcalendar/react";
import { cn } from "cn";

/**
 * How every calendar reads (`/salas`, `/salas/[id]`, the operator's activity): one look per state, so the legend means
 * the same everywhere. This file only names states; their colors are the `--calendar-*` tokens of `globals.css`, where
 * the theme overrides them and `theme-contrast.test.ts` checks them. Free time is the white surface you click; time
 * that takes nothing is a plain grey; the company's own booking is the one solid card; someone else's is a quiet grey
 * card; a block is a red tint with wide stripes; the range being booked is a tint framed in primary. What each card
 * says lives in `event-card.tsx`. Color is never the only cue: every card names its state and the legend repeats it.
 *
 * Everything is applied where the template's `EventCalendarViews` is used, never inside it. FullCalendar 7 reads an
 * event's classes from `className`, one string: `classNames`, its v6 name, is not a type error, it lands in
 * `extendedProps` and the event silently keeps the template's look.
 */

/** Wide stripes for a block, under its words: decorative, the card says "No disponible". */
const BLOCK_STRIPES =
  "bg-[repeating-linear-gradient(135deg,transparent_0_10px,var(--calendar-blocked-hatch)_10px_20px)]";

export type BusyState = "booked" | "mine" | "blocked";

export const BUSY_LOOK = {
  booked: {
    color: "var(--calendar-booked)",
    contrastColor: "var(--calendar-booked-foreground)",
    className: "border-calendar-booked-border!",
  },
  mine: {
    color: "var(--calendar-mine)",
    contrastColor: "var(--calendar-mine-foreground)",
    className: "border-calendar-mine-border! shadow-sm",
  },
  blocked: {
    color: "var(--calendar-blocked)",
    contrastColor: "var(--calendar-blocked-foreground)",
    className: `border-calendar-blocked-border! ${BLOCK_STRIPES}`,
  },
} as const satisfies Record<BusyState, Pick<EventInput, "color" | "contrastColor" | "className">>;

/** The range being booked. */
export const DRAFT_LOOK = {
  color: "var(--calendar-draft)",
  contrastColor: "var(--calendar-draft-foreground)",
  className: "border-2! border-calendar-draft-border! shadow-md",
} as const satisfies Pick<EventInput, "color" | "contrastColor" | "className">;

/** The part of today already gone, inside its column: the same plain grey as a closed day. */
export const UNAVAILABLE_LOOK = {
  display: "background",
  color: "var(--calendar-past)",
  className: "bg-calendar-past! cursor-not-allowed",
} as const satisfies Pick<EventInput, "display" | "color" | "className">;

/** A cancelled booking stays on the operator's calendar, faded and struck through, so a freed slot reads as freed. */
export const CANCELLED_CLASS = "opacity-(--calendar-cancelled-opacity) line-through";

/** The free surface under every grid. */
export const FREE_SURFACE = { tableBodyClass: "bg-calendar-free" } as const satisfies CalendarOptions;

/** Blocked by the operator first, then the company's own booking, then someone else's. */
export const busyStateOf = (span: BusySpan): BusyState => {
  if (span.kind === "blocked") return "blocked";
  return span.mine ? "mine" : "booked";
};

/** The swatch of each state for the legend, from the same tokens as the grid. */
export const LEGEND_SWATCH = {
  free: "bg-calendar-free border-input",
  draft: "bg-calendar-draft border-2 border-calendar-draft-border",
  mine: "bg-calendar-mine border-calendar-mine-border",
  booked: "bg-calendar-booked border-calendar-booked-border",
  blocked: cn("bg-calendar-blocked border-calendar-blocked-border", BLOCK_STRIPES),
  past: "bg-calendar-past border-transparent",
} as const;

// Days -----------------------------------------------------------------------------------------------------------------

const xxsTextClass = "text-[0.6875rem]/[1.090909]";

type DayMark = "picked" | "today" | null;

/** How a day's number is drawn: filled when picked, a ring and colored text when it is only today. */
const markClass = (mark: DayMark, hasNavLink: boolean) =>
  mark === "picked"
    ? ["bg-calendar-picked text-calendar-picked-foreground", hasNavLink && "group-hover:bg-calendar-picked/90"]
    : ["text-calendar-today ring-2 ring-inset ring-calendar-today", hasNavLink && "group-hover:bg-calendar-today/10"];

/**
 * A day that takes nothing (gone, closed, past the horizon) reads as such on the grid itself: its whole column in the
 * week and day views is the legend's "Ya pasó" (plain grey, the pointer refused). FullCalendar has no element per day and
 * half hour, only the day's column (`dayLane`) and the hour's row across every day (`slotLane`), so the part of today
 * already gone stays a background event inside the column (`UNAVAILABLE_LOOK`). The template's lane classes are kept.
 */
export function closedLaneOptions(isClosed: (date: Date) => boolean) {
  return {
    dayLaneClass: (info) =>
      cn(
        "border",
        info.isMajor && "border-foreground/20",
        isClosed(info.date) ? "bg-calendar-past cursor-not-allowed" : info.isDisabled && "bg-foreground/3",
      ),
  } satisfies CalendarOptions;
}

/**
 * The day the user asked for ("Ir a fecha", "Hoy", the link's day) and today. The template draws today in a half
 * transparent `chart-1` and marks no picked day, so a jump in the month view landed nowhere. Here the picked day's
 * number is filled and its whole cell framed, and today, when it is not the picked day, keeps a ring. Days that take
 * nothing go through `closedLaneOptions`, and their month cell is the same grey. The
 * unmarked branches repeat the template's own classes, so an unmarked day looks exactly as before.
 */
export function dayMarkOptions(isPicked: (date: Date) => boolean, isClosed: (date: Date) => boolean = () => false) {
  const markOf = (info: { readonly date: Date; readonly isToday: boolean }): DayMark =>
    isPicked(info.date) ? "picked" : info.isToday ? "today" : null;

  return {
    ...closedLaneOptions(isClosed),
    dayHeaderInnerClass: (info) => {
      const mark = markOf(info);
      return cn(
        "flex flex-row items-center",
        info.isNarrow ? "text-xs" : "text-sm",
        info.inPopover
          ? ["m-1.5 px-1 py-0.5 rounded-sm font-semibold", info.hasNavLink && "hover:bg-foreground/5"]
          : !info.dayNumberText
            ? [
                "mx-0.5 my-1.5 py-0.5 px-1.5 rounded-sm text-muted-foreground",
                info.hasNavLink && "hover:bg-foreground/5",
              ]
            : !mark
              ? ["mx-2 my-2.5 h-6 px-1.5 rounded-sm text-muted-foreground", info.hasNavLink && "hover:bg-foreground/5"]
              : "group mx-2 my-2 h-7 outline-none",
      );
    },
    dayHeaderContent: (info) => {
      const mark = markOf(info);
      if (info.inPopover || !info.dayNumberText || !mark) return <>{info.text}</>;
      return (
        <>
          {info.textParts.map((textPart, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one formatted date, never reordered.
              key={i}
              className={cn(
                "whitespace-pre",
                textPart.type === "day"
                  ? [
                      "first:-ms-1 last:-me-1 size-7 rounded-full font-semibold flex flex-row items-center justify-center",
                      markClass(mark, info.hasNavLink),
                      info.hasNavLink && "group-focus-visible:outline-3 outline-ring/50",
                    ]
                  : "text-muted-foreground",
              )}
            >
              {textPart.value}
            </span>
          ))}
        </>
      );
    },

    dayCellClass: (info) =>
      cn(
        "border",
        info.isMajor && "border-foreground/20",
        isClosed(info.date) && "fc-closed-day bg-calendar-past cursor-not-allowed",
        // The picked day's whole cell, not only its number, so it is found at a glance in a month.
        markOf(info) === "picked" &&
          "fc-picked-day bg-calendar-picked/5 outline-2 -outline-offset-2 outline-calendar-picked",
      ),
    dayCellTopInnerClass: (info) =>
      cn(
        "flex flex-row items-center",
        info.isNarrow ? `my-px h-5 ${xxsTextClass}` : "my-1 h-6 text-sm",
        !markOf(info)
          ? [
              "rounded-s-sm whitespace-nowrap",
              !info.isOther && "font-semibold",
              info.isNarrow ? "px-1" : "px-2",
              !info.monthText && "text-muted-foreground",
              info.hasNavLink && "hover:bg-foreground/5",
            ]
          : ["group outline-none", info.isNarrow ? "mx-px" : "mx-2"],
      ),
    dayCellTopContent: (info) => {
      const mark = markOf(info);
      if (!mark) return <>{info.text}</>;
      return (
        <>
          {info.textParts.map((textPart, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one formatted date, never reordered.
              key={i}
              className={cn(
                "whitespace-pre",
                textPart.type === "day"
                  ? [
                      "rounded-full font-semibold flex flex-row items-center justify-center",
                      markClass(mark, info.hasNavLink),
                      info.hasNavLink && "group-focus-visible:outline-3 outline-ring/50",
                      info.isNarrow ? "size-5" : "size-6 first:-ms-1 last:-me-1",
                    ]
                  : !info.monthText && "text-muted-foreground",
              )}
            >
              {textPart.value}
            </span>
          ))}
        </>
      );
    },

    listDayHeaderInnerClass: (info) => {
      const mark = info.level ? null : markOf(info);
      return cn(
        "m-1.5 px-1.5 py-0.5 rounded-sm text-sm",
        !info.level && "font-semibold",
        mark ? markClass(mark, false) : info.hasNavLink && "hover:bg-foreground/5",
        mark && info.hasNavLink && "focus-visible:outline-3 outline-ring/50",
      );
    },
  } satisfies CalendarOptions;
}
