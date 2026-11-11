import {
  type Actor,
  authorizeMember,
  type BookingId,
  type BookingPeriod,
  type BookingPhase,
  type BookingStatus,
  bookingPhase,
  fail,
  ok,
  type Result,
  toFacilityIso,
  validateBooking,
} from "@espacios/domain";

import type { BookingPosition, BookingRecord, MyBookingsView } from "../ports/bookings";
import type { RoomCatalog } from "../ports/queries/room-catalog";
import { type Dependencies, withRaceHandling } from "./shared";

/**
 * The booking view DTO (spec 0001, extended by spec 0003 with `phase` and `createdAt`): the same shape for the
 * Server Components, the Server Actions and the REST API. Instants are RFC 3339 with the facility's `-03:00`. It
 * never carries a company id or name.
 */
export type BookingView = {
  readonly id: BookingId;
  readonly room: { readonly id: string; readonly name: string };
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: BookingStatus;
  readonly phase: BookingPhase;
  readonly bookedBy: { readonly name: string };
  readonly createdAt: string;
  readonly cancelledAt: string | null;
};

export function toBookingView(record: BookingRecord, now: Date): BookingView {
  return {
    id: record.id,
    room: { id: record.room.id, name: record.room.name },
    startsAt: toFacilityIso(record.startsAt),
    endsAt: toFacilityIso(record.endsAt),
    status: record.status,
    phase: bookingPhase(record, now),
    bookedBy: { name: record.bookedBy.name },
    createdAt: toFacilityIso(record.createdAt),
    cancelledAt: record.cancelledAt ? toFacilityIso(record.cancelledAt) : null,
  };
}

export type BookRoomInput = BookingPeriod & { readonly roomId: string };

/** `created` tells a new booking (201) from the exact repeat of one this company already holds (200). */
export type BookRoomOutcome = { readonly booking: BookingView; readonly created: boolean };

/**
 * `bookRoom` (spec 0001, "Booking and cancel flows"): a member books a room for its own company.
 *
 * Order: authorize, check every rule (no database), check the room exists, then one tenant transaction runs
 * `insertIfFree`. If the database stored nothing, an overlapping confirmed booking exists: when it is this
 * company's own booking of exactly the same room and range (a double submit), it is returned as a success;
 * otherwise the answer is `conflict`, with nothing about the other booking. A refusal writes nothing.
 */
export async function bookRoom(
  deps: Dependencies & { readonly rooms: RoomCatalog },
  actor: Actor,
  input: BookRoomInput,
): Promise<Result<BookRoomOutcome>> {
  const member = authorizeMember(actor);
  if (!member.ok) return member;

  const now = deps.clock.now();
  const period = validateBooking(input, now);
  if (!period.ok) return period;

  const room = await deps.rooms.findRoom(input.roomId);
  if (!room) return fail("not_found");

  const { tenantId, userId } = member.value;
  const slot = { roomId: room.id, ...period.value };
  return withRaceHandling(() =>
    deps.uow.run(tenantId, async (tx): Promise<Result<BookRoomOutcome>> => {
      const id = deps.ids.next() as BookingId;
      const inserted = await tx.bookings.insertIfFree({ id, ...slot, bookedBy: userId, createdAt: now });
      if (inserted) return ok({ booking: toBookingView(inserted, now), created: true });

      const existing = await tx.bookings.findExactConfirmed(slot);
      if (existing) return ok({ booking: toBookingView(existing, now), created: false });
      return fail("conflict");
    }),
  );
}

export type ListMyBookingsInput = {
  readonly view: MyBookingsView;
  readonly after: BookingPosition | null;
  readonly limit: number;
};

export type MyBookingsPage = {
  readonly bookings: readonly BookingView[];
  /** Where the next page starts; `null` when this page is the last one. */
  readonly next: BookingPosition | null;
};

/** Spec 0001: 50 per page by default, never more than 100. */
export const MY_BOOKINGS_PAGE = { defaultLimit: 50, maxLimit: 100 } as const;

/**
 * `listMyBookings` (spec 0003): one page of one view of the member's company, made by any of its members. One row
 * more than asked is read to know whether another page exists. A database that cannot answer in time is `busy`.
 */
export async function listMyBookings(
  deps: Pick<Dependencies, "uow" | "clock">,
  actor: Actor,
  input: ListMyBookingsInput,
): Promise<Result<MyBookingsPage>> {
  const member = authorizeMember(actor);
  if (!member.ok) return member;

  const now = deps.clock.now();
  const limit = Math.min(Math.max(1, Math.trunc(input.limit)), MY_BOOKINGS_PAGE.maxLimit);
  return withRaceHandling(async () => {
    const rows = await deps.uow.run(member.value.tenantId, (tx) =>
      tx.myBookings.list({ view: input.view, after: input.after, limit: limit + 1, now }),
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const next = rows.length > limit && last ? { startsAt: last.startsAt, id: last.id } : null;
    return ok({ bookings: page.map((record) => toBookingView(record, now)), next });
  });
}
