import { type Actor, type BookingId, type LocalDate, type TenantId, type UserId, zonedInstant } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import type { BookingRecord, MyBookingsPageQuery, NewBooking } from "../ports/bookings";
import { BusyError, ConcurrencyError, type TenantTransaction, type UnitOfWork } from "../ports/ports";
import type { RoomCatalog, RoomView } from "../ports/queries/room-catalog";
import { bookRoom, listMyBookings, toBookingView } from "./bookings";

const at = (date: string, hours: number, minutes = 0) => zonedInstant(date as LocalDate, hours * 60 + minutes);

const ACME = "company-acme" as TenantId;
const GLOBEX = "company-globex" as TenantId;
const ana: Actor = { role: "member", userId: "user-ana" as UserId, tenantId: ACME };
const beto: Actor = { role: "member", userId: "user-beto" as UserId, tenantId: ACME };
const gus: Actor = { role: "member", userId: "user-gus" as UserId, tenantId: GLOBEX };
const operator: Actor = { role: "operator", userId: "user-operador" as UserId };

const NORTE: RoomView = { id: "room-norte", name: "Sala Norte", capacity: 8 };
const USERS: Record<string, string> = { "user-ana": "Ana", "user-beto": "Beto", "user-gus": "Gus" };

type Stored = BookingRecord & { readonly tenantId: TenantId };

/**
 * An in memory database with the two guarantees of the real one: overlap is checked across every company (the
 * exclusion constraint) and each transaction sees only its own company's rows (row level security). Writes of a
 * transaction that throws are dropped, like a rollback.
 */
function fakeDatabase() {
  let rows: Stored[] = [];
  const overlaps = (a: Pick<Stored, "startsAt" | "endsAt">, b: Pick<Stored, "startsAt" | "endsAt">) =>
    a.startsAt < b.endsAt && b.startsAt < a.endsAt;

  const tx = (tenantId: TenantId, pending: Stored[]): TenantTransaction => ({
    bookings: {
      insertIfFree: async (booking: NewBooking) => {
        const taken = [...rows, ...pending].some(
          (row) => row.status === "confirmed" && row.room.id === booking.roomId && overlaps(row, booking),
        );
        if (taken) return null;
        const stored: Stored = {
          tenantId,
          id: booking.id,
          room: { id: booking.roomId, name: NORTE.name },
          bookedBy: { name: USERS[booking.bookedBy] ?? "?" },
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          status: "confirmed",
          createdAt: booking.createdAt,
          cancelledAt: null,
        };
        pending.push(stored);
        return stored;
      },
      findExactConfirmed: async (slot) =>
        rows.find(
          (row) =>
            row.tenantId === tenantId &&
            row.status === "confirmed" &&
            row.room.id === slot.roomId &&
            row.startsAt.getTime() === slot.startsAt.getTime() &&
            row.endsAt.getTime() === slot.endsAt.getTime(),
        ) ?? null,
    },
    myBookings: {
      list: async (query: MyBookingsPageQuery) => {
        lastQuery = query;
        return rows.filter((row) => row.tenantId === tenantId).slice(0, query.limit);
      },
    },
  });

  let lastQuery: MyBookingsPageQuery | null = null;
  const uow: UnitOfWork = {
    run: async (tenantId, work) => {
      const pending: Stored[] = [];
      const result = await work(tx(tenantId, pending));
      rows = [...rows, ...pending];
      return result;
    },
  };
  return {
    uow,
    rows: () => rows,
    seed: (row: Stored) => {
      rows = [...rows, row];
    },
    lastQuery: () => lastQuery,
  };
}

const rooms: RoomCatalog = {
  listRooms: async () => [NORTE],
  findRoom: async (id) => (id === NORTE.id ? NORTE : null),
};

// Monday 2026-11-09, 09:00 in Buenos Aires.
const NOW = at("2026-11-09", 9);

function setup() {
  const db = fakeDatabase();
  let sequence = 0;
  const deps = {
    uow: db.uow,
    clock: { now: () => NOW },
    ids: { next: () => `booking-${++sequence}` },
    rooms,
  };
  return { db, deps };
}

const tuesday10to11 = { roomId: NORTE.id, startsAt: at("2026-11-10", 10), endsAt: at("2026-11-10", 11) };

describe("bookRoom", () => {
  it("stores a booking under the member's company, booked by the member, and returns its view", async () => {
    const { db, deps } = setup();
    const result = await bookRoom(deps, ana, tuesday10to11);

    expect(result).toEqual({
      ok: true,
      value: {
        created: true,
        booking: {
          id: "booking-1",
          room: { id: "room-norte", name: "Sala Norte" },
          startsAt: "2026-11-10T10:00:00-03:00",
          endsAt: "2026-11-10T11:00:00-03:00",
          status: "confirmed",
          phase: "upcoming",
          bookedBy: { name: "Ana" },
          createdAt: "2026-11-09T09:00:00-03:00",
          cancelledAt: null,
        },
      },
    });
    expect(db.rows()).toMatchObject([{ tenantId: ACME, id: "booking-1", bookedBy: { name: "Ana" } }]);
  });

  it("refuses the operator with forbidden and writes nothing", async () => {
    const { db, deps } = setup();
    await expect(bookRoom(deps, operator, tuesday10to11)).resolves.toEqual({ ok: false, reason: "forbidden" });
    expect(db.rows()).toEqual([]);
  });

  it.each([
    ["not_on_grid", { startsAt: at("2026-11-10", 10, 15), endsAt: at("2026-11-10", 11, 15) }],
    ["outside_hours", { startsAt: at("2026-11-10", 7), endsAt: at("2026-11-10", 8) }],
    ["invalid_range", { startsAt: at("2026-11-10", 11), endsAt: at("2026-11-10", 10) }],
    ["too_short", { startsAt: at("2026-11-10", 10), endsAt: at("2026-11-10", 10, 15) }],
    ["too_long", { startsAt: at("2026-11-10", 10), endsAt: at("2026-11-10", 15) }],
    ["past_date", { startsAt: at("2026-11-06", 10), endsAt: at("2026-11-06", 11) }],
    ["beyond_horizon", { startsAt: at("2027-01-11", 10), endsAt: at("2027-01-11", 11) }],
  ])("returns %s for that rule and writes nothing", async (reason, period) => {
    const { db, deps } = setup();
    await expect(bookRoom(deps, ana, { roomId: NORTE.id, ...period })).resolves.toEqual({ ok: false, reason });
    expect(db.rows()).toEqual([]);
  });

  it("returns not_found for an unknown room", async () => {
    const { db, deps } = setup();
    const result = await bookRoom(deps, ana, { ...tuesday10to11, roomId: "room-nope" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(db.rows()).toEqual([]);
  });

  it("gives another company conflict for an overlapping time, with nothing about the booking it hit", async () => {
    const { db, deps } = setup();
    await bookRoom(deps, ana, tuesday10to11);
    const result = await bookRoom(deps, gus, {
      ...tuesday10to11,
      startsAt: at("2026-11-10", 10, 30),
      endsAt: at("2026-11-10", 11, 30),
    });

    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(db.rows()).toHaveLength(1);
  });

  it("gives another company conflict for the exact same slot (the repeat rule is per company)", async () => {
    const { deps } = setup();
    await bookRoom(deps, ana, tuesday10to11);
    await expect(bookRoom(deps, gus, tuesday10to11)).resolves.toEqual({ ok: false, reason: "conflict" });
  });

  it("returns the existing booking for an exact repeat by the same company, made by any member (P-11)", async () => {
    const { db, deps } = setup();
    const first = await bookRoom(deps, ana, tuesday10to11);
    const repeat = await bookRoom(deps, beto, tuesday10to11);

    expect(repeat).toEqual({ ok: true, value: { created: false, booking: first.ok && first.value.booking } });
    expect(db.rows()).toHaveLength(1);
  });

  it("gives the same company conflict for a different range that overlaps its own booking", async () => {
    const { deps } = setup();
    await bookRoom(deps, ana, tuesday10to11);
    const longer = { ...tuesday10to11, endsAt: at("2026-11-10", 12) };
    await expect(bookRoom(deps, ana, longer)).resolves.toEqual({ ok: false, reason: "conflict" });
  });

  it("turns a lost race into conflict and a timeout into busy", async () => {
    const { deps } = setup();
    const throwing = (error: Error) => ({
      ...deps,
      uow: {
        run: async () => {
          throw error;
        },
      },
    });
    await expect(bookRoom(throwing(new ConcurrencyError()), ana, tuesday10to11)).resolves.toEqual({
      ok: false,
      reason: "conflict",
    });
    await expect(bookRoom(throwing(new BusyError()), ana, tuesday10to11)).resolves.toEqual({
      ok: false,
      reason: "busy",
    });
  });
});

function record(id: string, startsAt: Date, endsAt: Date): Stored {
  return {
    tenantId: ACME,
    id: id as BookingId,
    room: { id: NORTE.id, name: NORTE.name },
    bookedBy: { name: "Ana" },
    startsAt,
    endsAt,
    status: "confirmed",
    createdAt: at("2026-11-01", 9),
    cancelledAt: null,
  };
}

describe("listMyBookings", () => {
  it("returns one page with a position to continue from when there are more rows", async () => {
    const { db, deps } = setup();
    for (const hour of [10, 11, 12]) db.seed(record(`b-${hour}`, at("2026-11-10", hour), at("2026-11-10", hour + 1)));

    const result = await listMyBookings(deps, ana, { view: "upcoming", after: null, limit: 2 });

    expect(result.ok && result.value.bookings.map((booking) => booking.id)).toEqual(["b-10", "b-11"]);
    expect(result.ok && result.value.next).toEqual({ startsAt: at("2026-11-10", 11), id: "b-11" });
    expect(db.lastQuery()).toEqual({ view: "upcoming", after: null, limit: 3, now: NOW });
  });

  it("returns no position on the last page", async () => {
    const { db, deps } = setup();
    db.seed(record("b-10", at("2026-11-10", 10), at("2026-11-10", 11)));
    const result = await listMyBookings(deps, ana, { view: "upcoming", after: null, limit: 50 });
    expect(result.ok && result.value.next).toBeNull();
  });

  it("passes the view and the position on, and keeps the limit between 1 and 100", async () => {
    const { db, deps } = setup();
    const after = { startsAt: at("2026-11-10", 10), id: "b-10" };
    await listMyBookings(deps, ana, { view: "past", after, limit: 500 });
    expect(db.lastQuery()).toMatchObject({ view: "past", after, limit: 101 });
    await listMyBookings(deps, ana, { view: "cancelled", after: null, limit: 0 });
    expect(db.lastQuery()).toMatchObject({ view: "cancelled", limit: 2 });
  });

  it("refuses the operator with forbidden", async () => {
    const { deps } = setup();
    const result = await listMyBookings(deps, operator, { view: "upcoming", after: null, limit: 50 });
    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("turns a timeout into busy", async () => {
    const { deps } = setup();
    const busy = {
      ...deps,
      uow: {
        run: async () => {
          throw new BusyError();
        },
      },
    };
    const result = await listMyBookings(busy, ana, { view: "upcoming", after: null, limit: 50 });
    expect(result).toEqual({ ok: false, reason: "busy" });
  });
});

describe("toBookingView", () => {
  it("derives the phase at read time and writes the cancel time in the facility zone", () => {
    const cancelled: BookingRecord = {
      ...record("b-1", at("2026-11-10", 10), at("2026-11-10", 11)),
      status: "cancelled",
      cancelledAt: at("2026-11-09", 8, 15),
    };
    expect(toBookingView(cancelled, NOW)).toMatchObject({
      phase: "cancelled",
      cancelledAt: "2026-11-09T08:15:00-03:00",
    });
    expect(toBookingView(record("b-2", at("2026-11-09", 8), at("2026-11-09", 10)), NOW).phase).toBe("in_progress");
  });

  it("never carries the company", () => {
    const view = toBookingView(record("b-1", at("2026-11-10", 10), at("2026-11-10", 11)), NOW);
    expect(JSON.stringify(view)).not.toContain(ACME);
  });
});
