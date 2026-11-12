import type { BookingId, BookingStatus, BusyInterval, UserId } from "@espacios/domain";

/** A booking as the company edge reads it: with the room's name and who booked it, never the company. */
export type BookingRecord = {
  readonly id: BookingId;
  /** `timeZone` is the room's facility zone, so the view writes its instants with the right offset (spec 0004). */
  readonly room: { readonly id: string; readonly name: string; readonly timeZone: string };
  readonly bookedBy: { readonly name: string };
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: BookingStatus;
  readonly createdAt: Date;
  readonly cancelledAt: Date | null;
};

/** A booking to store as `confirmed`. The company is the transaction's tenant, so it is not here. */
export type NewBooking = {
  readonly id: BookingId;
  readonly roomId: string;
  readonly bookedBy: UserId;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly createdAt: Date;
};

export type BookingSlot = Pick<NewBooking, "roomId" | "startsAt" | "endsAt">;

/** Writes of the company edge. Obtained from a `TenantTransaction`, so already scoped to one company. */
export interface BookingRepository {
  /**
   * Stores the booking unless a confirmed booking of the same room overlaps it, for any company (the database's
   * exclusion constraint decides, waiting for any conflicting transaction still in flight). `null` when it overlaps.
   */
  insertIfFree(booking: NewBooking): Promise<BookingRecord | null>;
  /** This company's confirmed booking of exactly this room and range, if any: the exact repeat of a request. */
  findExactConfirmed(slot: BookingSlot): Promise<BookingRecord | null>;
  /**
   * Cancels this company's booking in one statement that only matches a confirmed booking that has not started at
   * `now`, so a cancel racing a cancel or the start cannot both win. `null` when nothing matched (it does not exist
   * for this company, it was cancelled, or it started): `find` tells which.
   */
  cancel(id: BookingId, now: Date): Promise<BookingRecord | null>;
  /** This company's booking by id, whatever its state. Another company's booking is `null`. */
  find(id: BookingId): Promise<BookingRecord | null>;
}

/**
 * The three lists of Mis reservas (spec 0003): upcoming is confirmed and not ended, soonest first; past is confirmed
 * and ended, most recent first; cancelled is cancelled, most recent first.
 */
export const MY_BOOKINGS_VIEWS = ["upcoming", "past", "cancelled"] as const;
export type MyBookingsView = (typeof MY_BOOKINGS_VIEWS)[number];

/** Where a page ended, in the view's order on `(startsAt, id)`. The company is never part of it. */
export type BookingPosition = { readonly startsAt: Date; readonly id: string };

export type MyBookingsPageQuery = {
  readonly view: MyBookingsView;
  /** Continue strictly after this booking; `null` for the first page. */
  readonly after: BookingPosition | null;
  readonly limit: number;
  /** Splits upcoming from past. */
  readonly now: Date;
};

/** Reads of the company edge, from a `TenantTransaction`: the tenant filter plus row level security. */
export interface MyBookingsQuery {
  list(query: MyBookingsPageQuery): Promise<readonly BookingRecord[]>;
}

/**
 * Every room's busy time in a range (spec 0008), read inside the company's tenant transaction: `mine` marks the
 * caller's own bookings, and nothing else about a booking or a block ever reaches a company.
 */
export interface AvailabilityQuery {
  /** Confirmed bookings and unreleased blocks overlapping `[from, to)`, for every room or the one given. */
  busyIntervals(
    from: Date,
    to: Date,
    roomId?: string,
  ): Promise<readonly (BusyInterval & { readonly roomId: string })[]>;
}
