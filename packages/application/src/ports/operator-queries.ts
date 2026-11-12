import type { BookingId, BookingStatus, LocalDate } from "@espacios/domain";

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
  readonly room: {
    readonly id: string;
    readonly name: string;
    readonly timeZone: string;
    readonly facilityName: string;
  };
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

/** Inclusive local days. Each facility reads them in its own time zone. */
export type MetricRange = { readonly from: LocalDate; readonly to: LocalDate };

/** What one room offered and used in a range. Minutes, never ratios: the ratios are rules of the domain. */
export type RoomUsageRow = {
  readonly roomId: string;
  readonly roomName: string;
  readonly facilityId: string;
  readonly facilityName: string;
  /** Opening minutes inside the room's active window, minus blocked time. */
  readonly openMinutes: number;
  readonly blockedMinutes: number;
  /** Confirmed bookings starting in the range. */
  readonly bookedMinutes: number;
};

export type CompanyUsageRow = {
  readonly id: string;
  readonly name: string;
  readonly kind: "company" | "individual";
  readonly active: boolean;
  readonly bookedMinutes: number;
  readonly confirmed: number;
  readonly cancelled: number;
  /** When the company last made a confirmed booking, whatever the range. `null` if it never did. */
  readonly lastBookingAt: Date | null;
};

/** One weekday by hour cell of one facility, hours read in its own zone. Only cells with open or booked minutes. */
export type HeatmapRow = {
  readonly facilityId: string;
  readonly facilityName: string;
  readonly weekday: number;
  readonly hour: number;
  readonly openMinutes: number;
  readonly bookedMinutes: number;
};

/** One local day across every room of a scope: what was open and what was booked, with the room usage definitions. */
export type DailyUsageRow = {
  readonly date: LocalDate;
  readonly openMinutes: number;
  readonly bookedMinutes: number;
};

/**
 * One client's use in a range (spec 0007): confirmed bookings by room and by weekday, each read on the local day of its
 * facility, as in `roomUsage`. Cancelled bookings never count.
 */
export type ClientActivityRows = {
  readonly rooms: readonly {
    readonly roomId: string;
    readonly roomName: string;
    readonly facilityId: string;
    readonly facilityName: string;
    readonly bookedMinutes: number;
    readonly confirmed: number;
  }[];
  /** 0 Sunday to 6 Saturday, only the weekdays with a booking. */
  readonly weekdays: readonly {
    readonly weekday: number;
    readonly bookedMinutes: number;
    readonly confirmed: number;
  }[];
  /** Confirmed bookings of the client starting after `now`, whatever the range. */
  readonly upcoming: number;
};

export type HeatmapScope = { readonly facilityId?: string | undefined; readonly roomId?: string | undefined };

export interface OperatorQueries {
  listBookings(query: OperatorBookingsPageQuery): Promise<readonly OperatorBookingRecord[]>;
  /** Every room, including ones deactivated or not yet active (their open minutes are 0 when out of the range). */
  roomUsage(range: MetricRange): Promise<readonly RoomUsageRow[]>;
  /** Every company, idle and inactive ones included. */
  companyUsage(range: MetricRange, kind?: "company" | "individual"): Promise<readonly CompanyUsageRow[]>;
  heatmap(range: MetricRange, scope: HeatmapScope): Promise<readonly HeatmapRow[]>;
  /** Spec 0007: one client's bookings by room and weekday in the range, and how many are still to come. */
  clientActivity(range: MetricRange, companyId: string, now: Date): Promise<ClientActivityRows>;
  /** One row per local day of the range, closed days included (zero open minutes). */
  dailyUsage(range: MetricRange, scope: HeatmapScope): Promise<readonly DailyUsageRow[]>;
  /** Whether the facility and the room of a scope exist (a heatmap of an unknown one is 404). */
  scopeExists(scope: HeatmapScope): Promise<boolean>;
}
