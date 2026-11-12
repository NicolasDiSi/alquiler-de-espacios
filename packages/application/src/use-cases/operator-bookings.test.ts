import type { Actor, BookingId, UserId } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import type { OperatorBookingRecord, OperatorBookingsPageQuery, OperatorQueries } from "../ports/operator-queries";
import { BusyError } from "../ports/ports";
import { listOperatorBookings } from "./operator-bookings";

const NOW = new Date("2026-11-10T12:00:00Z");
const operator: Actor = { role: "operator", userId: "user-operador" as UserId };
const member: Actor = { role: "member", userId: "user-ana" as UserId, tenantId: "company-acme" as never };

const record = (id: string, startsAt: string, hours = 1): OperatorBookingRecord => ({
  id: id as BookingId,
  company: { id: "company-acme", name: "Acme" },
  room: { id: "room-1", name: "Sala 1", timeZone: "America/Argentina/Buenos_Aires" },
  bookedBy: { name: "Ana" },
  startsAt: new Date(startsAt),
  endsAt: new Date(new Date(startsAt).getTime() + hours * 3_600_000),
  status: "confirmed",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  cancelledAt: null,
});

function setup(rows: readonly OperatorBookingRecord[]) {
  const seen: OperatorBookingsPageQuery[] = [];
  const queries: OperatorQueries = {
    listBookings: async (query) => {
      seen.push(query);
      return rows.slice(0, query.limit);
    },
  };
  return { seen, deps: { queries, clock: { now: () => NOW } } };
}

describe("listOperatorBookings (spec 0004, AC-10)", () => {
  it("refuses a member before reading anything", async () => {
    const { deps, seen } = setup([]);
    await expect(listOperatorBookings(deps, member, { filter: {}, after: null, limit: 10 })).resolves.toMatchObject({
      ok: false,
      reason: "forbidden",
    });
    expect(seen).toEqual([]);
  });

  it("returns the company name and the facility offset, and reads one row more than the page", async () => {
    const { deps, seen } = setup([record("b1", "2026-11-11T13:00:00Z")]);
    const result = await listOperatorBookings(deps, operator, {
      filter: { status: "confirmed" },
      after: null,
      limit: 5,
    });

    expect(seen[0]).toMatchObject({ limit: 6, now: NOW, after: null, filter: { status: "confirmed" } });
    expect(result).toEqual({
      ok: true,
      value: {
        next: null,
        bookings: [
          {
            id: "b1",
            company: { id: "company-acme", name: "Acme" },
            room: { id: "room-1", name: "Sala 1" },
            startsAt: "2026-11-11T10:00:00-03:00",
            endsAt: "2026-11-11T11:00:00-03:00",
            status: "confirmed",
            phase: "upcoming",
            bookedBy: { name: "Ana" },
            createdAt: "2026-10-31T21:00:00-03:00",
            cancelledAt: null,
          },
        ],
      },
    });
  });

  it("gives a next position with the run of the last row, and caps the limit at 100", async () => {
    const rows = [
      record("b1", "2026-11-11T13:00:00Z"),
      record("b2", "2026-11-09T13:00:00Z"),
      record("b3", "2026-11-08T13:00:00Z"),
    ];
    const { deps, seen } = setup(rows);
    const first = await listOperatorBookings(deps, operator, { filter: {}, after: null, limit: 2 });
    expect(first).toMatchObject({ ok: true, value: { next: { now: NOW, run: "past", id: "b2" } } });

    await listOperatorBookings(deps, operator, { filter: {}, after: null, limit: 5000 });
    expect(seen.at(-1)?.limit).toBe(101);
  });

  it("keeps the `now` of the cursor so a booking never changes run between pages", async () => {
    const { deps, seen } = setup([]);
    const pinned = new Date("2026-11-01T00:00:00Z");
    await listOperatorBookings(deps, operator, {
      filter: {},
      after: { now: pinned, run: "upcoming", startsAt: pinned, id: "b0" },
      limit: 10,
    });
    expect(seen[0]?.now).toEqual(pinned);
  });

  it("returns busy when the database cannot answer in time", async () => {
    const queries: OperatorQueries = {
      listBookings: async () => {
        throw new BusyError();
      },
    };
    await expect(
      listOperatorBookings({ queries, clock: { now: () => NOW } }, operator, { filter: {}, after: null, limit: 10 }),
    ).resolves.toEqual({ ok: false, reason: "busy" });
  });
});
