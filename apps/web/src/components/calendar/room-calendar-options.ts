import type { CalendarOptions, ViewOptions } from "@fullcalendar/react";
import { cn } from "cn";

/**
 * What the room calendars (`/salas` and `/salas/[id]`) change on the template's `EventCalendarViews`, applied where it
 * is used and never inside it: a white body so free time reads as the surface you book on, times as `14:00`, and the
 * opening hour labelled (the template hides the first label, which sits above the grid).
 */
export const ROOM_CALENDAR_OPTIONS = {
  tableBodyClass: "bg-card",
  eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
} satisfies CalendarOptions;

/**
 * The time grid's options, with the sede's offset (`zone`, "GMT-3") in the corner above the time axis: every time on
 * the grid is the sede's, whatever the browser's zone. FullCalendar only fills that corner with the week number, so
 * the week number header is turned on and given the zone instead.
 */
export function roomTimeGrid(zone: string) {
  return {
    weekNumbers: true,
    weekNumberHeaderContent: () => zone,
    slotHeaderInnerClass: (info) =>
      cn(
        "relative m-2 tabular-nums",
        info.isNarrow ? "text-[0.6875rem]/[1.090909]" : "text-xs",
        !info.isFirst && (info.isNarrow ? "-top-3.5" : "-top-4"),
      ),
  } satisfies ViewOptions;
}
