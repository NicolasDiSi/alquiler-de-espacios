"use client";

import type { EventDisplayInfo, ViewOptions } from "@fullcalendar/react";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { CalendarCheck, CalendarOff, Pointer } from "lucide-react";
import { useTranslations } from "next-intl";

/** The states a card can be in. A company sees `booked` without whose it is; only the operator sees names. */
type CardVariant = "booked" | "mine" | "blocked" | "draft";

/**
 * What a calendar event carries for its card, in `extendedProps.card`. Only what the viewer may read: a company's
 * calendar never puts another company's name or a block's reason here.
 */
export type CardData = {
  readonly variant: CardVariant;
  /** The state in words ("Tu reserva", "Ocupada", "No disponible"): every card names its state, color is not enough. */
  readonly label: string;
  /** The operator's calendar: the client, or the block's reason. */
  readonly title?: string;
  /** The operator's calendar: the room and who booked. */
  readonly detail?: string;
  /** A cancelled booking, still shown to the operator: faded and struck through. */
  readonly cancelled?: boolean;
};

const ICON = { booked: null, mine: CalendarCheck, blocked: CalendarOff, draft: Pointer } as const;

/** The state's badge: a chip on the solid card, plain words on the quiet ones. */
const badge = cva("inline-flex w-fit max-w-full items-center gap-1 truncate font-semibold", {
  variants: {
    variant: {
      booked: "text-current",
      mine: "bg-calendar-mine-foreground text-calendar-mine rounded-sm px-1.5 py-0.5",
      blocked: "text-calendar-blocked-foreground",
      draft: "text-current",
    },
  },
});

const minutesBetween = (start: Date | null, end: Date | null) =>
  start && end ? Math.round((end.getTime() - start.getTime()) / 60_000) : 0;

/**
 * The card inside an event of the week and day views, passed to FullCalendar as the `eventContent` slot; the template's
 * frame (fill, border, radius) stays its own. Three sizes: a short event (FullCalendar's `isShort`, half an hour) is one
 * line, state and time; an hour or less, or a narrow column, is two lines, the title (or the state) and the time; a
 * longer one stacks the state, the title and the details, with the time and the length at its foot. The range being booked shows its length in a chip (its dialog is already open to confirm).
 */
function EventCard({ info }: { readonly info: EventDisplayInfo }) {
  const filters = useTranslations("booking.filters");
  const card = info.event.extendedProps.card as CardData | undefined;
  if (!card) return <span className="truncate">{info.event.title}</span>;

  const Icon = ICON[card.variant];
  const minutes = minutesBetween(info.event.start, info.event.end);
  const length = filters("minutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  const words = cn(card.cancelled && "line-through");

  // Two lines when a full card would not fit: an hour or less, or a column shared with other events.
  if (!info.isShort && (minutes <= 60 || info.isNarrow)) {
    return (
      <span className={cn("flex min-w-0 flex-col gap-0.5", words)}>
        <span className={cn(badge({ variant: card.variant }), card.variant === "mine" && "py-0")}>
          {Icon && !info.isNarrow ? <Icon aria-hidden className="size-3 shrink-0" /> : null}
          <span className="truncate">{card.title ?? card.label}</span>
        </span>
        <span className="truncate tabular-nums opacity-80">{info.timeText}</span>
      </span>
    );
  }

  if (info.isShort) {
    return (
      <span className={cn("flex min-w-0 items-center gap-1.5", words)}>
        {Icon ? <Icon aria-hidden className="size-3 shrink-0" /> : null}
        <span className="truncate font-semibold">{card.title ?? card.label}</span>
        <span className="ms-auto shrink-0 tabular-nums opacity-80">{info.timeText}</span>
      </span>
    );
  }

  return (
    <span className={cn("flex h-full min-h-0 flex-col gap-0.5", words)}>
      {card.variant === "draft" ? (
        <span className="flex items-start justify-between gap-2">
          <span className={badge({ variant: card.variant })}>
            {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
            {card.label}
          </span>
          <span className="bg-calendar-chip text-calendar-chip-foreground shrink-0 rounded-sm px-1.5 py-0.5 font-semibold tabular-nums">
            {length}
          </span>
        </span>
      ) : (
        <span className={badge({ variant: card.variant })}>
          {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
          <span className="truncate">{card.label}</span>
        </span>
      )}
      {card.title ? <span className="truncate text-sm font-semibold">{card.title}</span> : null}
      {card.detail ? <span className="truncate opacity-80">{card.detail}</span> : null}
      <span className="mt-auto flex items-end justify-between gap-2 pt-1">
        <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">{info.timeText}</span>
        {card.variant === "draft" ? null : <span className="truncate opacity-80">{length}</span>}
      </span>
    </span>
  );
}

/**
 * The card as the time grid's slot, for a view's options (`views.timeGrid`): the month keeps the template's one line
 * list. The inner box fills the event's height, so the time sits at the foot of a tall card.
 */
export const EVENT_CARD_VIEW = {
  eventContent: (info) => <EventCard info={info} />,
  columnEventInnerClass: (info) =>
    cn(
      "flex h-full min-h-0 text-xs",
      info.isShort ? "flex-row items-center px-1.5 py-0.5" : info.isNarrow ? "px-1 py-1" : "px-2 py-1.5",
    ),
} satisfies ViewOptions;
