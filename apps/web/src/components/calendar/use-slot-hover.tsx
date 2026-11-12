"use client";

import { type PointerEvent, type ReactNode, useCallback, useRef, useState } from "react";

import type { CalendarOptions } from "@fullcalendar/react";
import { createPortal } from "react-dom";

import { timeOf } from "@/lib/bookings/search";

type Box = { readonly top: number; readonly left: number; readonly width: number; readonly height: number };

/** The current time on the grid: local minutes and the hours the grid shows, all in the sede's clock. */
export type NowOnGrid = { readonly minutes: number; readonly opensAt: number; readonly closesAt: number };

/**
 * Two layers over a FullCalendar time grid that it cannot draw itself:
 *
 * - a blue frame on the free slot under the pointer. FullCalendar draws a column per day and a row per slot across all
 *   of them, so no element is one cell: this remembers the columns and the rows as they mount and frames the column
 *   under the pointer at the height of the row under it, when `isFree` says the slot that starts there can be booked;
 * - the current time as one line across every column, with its time on the axis. FullCalendar's own indicator only
 *   crosses the column of today, and in the rooms matrix every column is the same day. The line is rendered inside
 *   the container of the grid's rows (a portal), placed by percentage of the open hours: it scrolls with the rows and
 *   never needs measuring, whatever the height, the scroll or the moment the grid finishes its layout.
 *
 * Every time here is the sede's wall clock: the calendars run in UTC with that clock written as UTC, so a column's
 * date, a row's `data-time` and `now.minutes` all read the same clock. Spread `handlers` on a `relative` wrapper
 * around the calendar, render `overlay` inside it and pass `options` to the calendar.
 */
export function useSlotHover(isFree: (start: Date) => boolean, now: NowOnGrid | null = null) {
  const lanes = useRef(new Map<HTMLElement, Date>());
  const rows = useRef(new Map<HTMLElement, number>());
  const rowsHost = useRef<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const target = event.target as Node;
      const lane = [...lanes.current].find(([el]) => el.contains(target));
      const row =
        lane &&
        [...rows.current].find(([el]) => {
          const rect = el.getBoundingClientRect();
          return event.clientY >= rect.top && event.clientY < rect.bottom;
        });
      if (!lane || !row) return setBox(null);
      const [laneEl, day] = lane;
      const [rowEl, minutes] = row;
      if (!isFree(new Date(day.getTime() + minutes * 60_000))) return setBox(null);
      const outer = event.currentTarget.getBoundingClientRect();
      const column = laneEl.getBoundingClientRect();
      const slot = rowEl.getBoundingClientRect();
      setBox({ top: slot.top - outer.top, left: column.left - outer.left, width: column.width, height: slot.height });
    },
    [isFree],
  );

  const clear = useCallback(() => setBox(null), []);

  const options = {
    dayLaneDidMount: (info) => {
      lanes.current.set(info.el, info.date);
    },
    dayLaneWillUnmount: (info) => {
      lanes.current.delete(info.el);
    },
    slotLaneDidMount: (info) => {
      // FullCalendar writes the row's time of day as `data-time="HH:MM:SS"`.
      const [hours = 0, minutes = 0] = (info.el.dataset.time ?? "").split(":").map(Number);
      rows.current.set(info.el, hours * 60 + minutes);
      // A row is the lane next to its axis label; their parent holds every row, from the axis to the last column.
      const container = info.el.parentElement?.parentElement ?? null;
      if (container && container !== rowsHost.current) {
        rowsHost.current = container;
        setHost(container);
      }
    },
    slotLaneWillUnmount: (info) => {
      rows.current.delete(info.el);
      if (rows.current.size === 0) {
        rowsHost.current = null;
        setHost(null);
      }
    },
  } satisfies CalendarOptions;

  const showNow = now !== null && now.minutes >= now.opensAt && now.minutes < now.closesAt;
  const nowLine =
    host && showNow
      ? createPortal(
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-20"
            style={{ top: `${((now.minutes - now.opensAt) / (now.closesAt - now.opensAt)) * 100}%` }}
          >
            <div className="bg-destructive absolute inset-x-0 h-0.5 -translate-y-1/2" />
            <span className="bg-destructive text-primary-foreground absolute left-1 -translate-y-1/2 rounded-sm px-1 py-0.5 text-[0.6875rem] leading-none font-semibold tabular-nums">
              {timeOf(now.minutes)}
            </span>
          </div>,
          host,
        )
      : null;

  const overlay: ReactNode = (
    <>
      {box ? (
        <div
          aria-hidden
          className="ring-primary pointer-events-none absolute z-10 rounded-sm ring-2 ring-inset"
          style={box}
        />
      ) : null}
      {nowLine}
    </>
  );

  return {
    handlers: { onPointerMove, onPointerLeave: clear, onScrollCapture: clear, onPointerDown: clear },
    overlay,
    options,
  };
}
