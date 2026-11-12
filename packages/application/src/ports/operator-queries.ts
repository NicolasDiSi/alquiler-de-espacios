import type { BookingId, BookingStatus } from "@espacios/domain";

/**
 * The operator's global reads (spec 0004): every company's data, through the operator login and never a tenant
 * transaction. Read only; the operator login has no write grant on `booking`.
 */

/** Every field narrows the list; none given means every booking. `from` and `to` bound `startsAt`: `[from, to)`. */
export type OperatorBookingFilter = {
  readonly companyId?: string | undefined;
  readonly roomId?: string | undefined;
  readonly facilityId?: string | undefined;
  readonly status?: BookingStatus | undefined;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
};

/** A booking as the operator reads it: it names the company, which a member never sees of another company. */
export type OperatorBookingRecord = {
  readonly id: BookingId;
  readonly company: { readonly id: string; readonly name: string };
  /** `timeZone` is the room's facility zone, so the view writes its instants with the right offset. */
  readonly room: { readonly id: string; readonly name: string; readonly timeZone: string };
  readonly bookedBy: { readonly name: string };
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: BookingStatus;
  readonly createdAt: Date;
  readonly cancelledAt: Date | null;
};

/**
 * Where a page ended. The list has two runs: bookings not yet ended (soonest first), then the ones already ended (most
 * recent first). `now` is pinned from the first page, so a booking never changes run between pages.
 */
export type OperatorBookingPosition = {
  readonly now: Date;
  readonly run: "upcoming" | "past";
  readonly startsAt: Date;
  readonly id: string;
};

export type OperatorBookingsPageQuery = {
  readonly filter: OperatorBookingFilter;
  /** Continue strictly after this booking; `null` for the first page. */
  readonly after: OperatorBookingPosition | null;
  readonly limit: number;
  readonly now: Date;
};

export interface OperatorQueries {
  listBookings(query: OperatorBookingsPageQuery): Promise<readonly OperatorBookingRecord[]>;
}
