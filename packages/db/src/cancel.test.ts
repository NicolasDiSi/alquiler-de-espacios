import { bookRoom, cancelBooking } from "@espacios/application";
import { type Actor, type LocalDate, type UserId, zonedInstant } from "@espacios/domain";
import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createUuidV7Generator } from "./ids";
import { createPrismaRoomCatalog } from "./room-catalog";
import { createMember, createRoom, createTenant } from "./testing/fixtures";
import { createPrismaUnitOfWork } from "./unit-of-work";

const urls = inject("databaseUrls");
const owner = createDatabaseClient(urls.ownerUrl);
const runtime = createDatabaseClient(urls.runtimeUrl);
const operator = createDatabaseClient(urls.operatorUrl);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect(), operator.$disconnect()]);
});

const at = (date: string, hours: number) =>
  zonedInstant(date as LocalDate, hours * 60, "America/Argentina/Buenos_Aires");

// Monday 2030-01-07, 09:00 in Buenos Aires. Bookings go on Tuesday the 8th.
const BEFORE = at("2030-01-07", 9);
const DAY = "2030-01-08";

const edge = (now: Date) => ({
  uow: createPrismaUnitOfWork(runtime),
  clock: { now: () => now },
  ids: createUuidV7Generator(),
  rooms: createPrismaRoomCatalog(runtime),
});

async function member(name: string): Promise<Actor & { role: "member" }> {
  const tenantId = await createTenant(owner, name);
  const userId = (await createMember(owner, tenantId)) as UserId;
  return { role: "member", tenantId, userId };
}

async function bookFor(actor: Actor, roomId: string, from: number, to: number): Promise<string> {
  const result = await bookRoom(edge(BEFORE), actor, { roomId, startsAt: at(DAY, from), endsAt: at(DAY, to) });
  if (!result.ok) throw new Error(`setup booking refused: ${result.reason}`);
  return result.value.booking.id;
}

describe("cancelBooking against Postgres (runtime login, RLS on)", () => {
  it("cancels, stamps cancelled_at and frees the slot for another company at once (P-2)", async () => {
    const [ana, gus] = [await member("cancel-a"), await member("cancel-b")];
    const roomId = await createRoom(owner);
    const id = await bookFor(ana, roomId, 10, 11);

    const result = await cancelBooking(edge(BEFORE), ana, id);
    expect(result).toMatchObject({ ok: true, value: { id, status: "cancelled", phase: "cancelled" } });
    expect(await operator.booking.findUnique({ where: { id } })).toMatchObject({
      status: "cancelled",
      cancelledAt: BEFORE,
    });

    const rebooked = await bookRoom(edge(BEFORE), gus, { roomId, startsAt: at(DAY, 10), endsAt: at(DAY, 11) });
    expect(rebooked).toMatchObject({ ok: true, value: { created: true } });
  });

  it("any member of the company may cancel, not only the one who booked", async () => {
    const ana = await member("cancel-colleague");
    const colleagueId = (await createMember(owner, ana.tenantId)) as UserId;
    const roomId = await createRoom(owner);
    const id = await bookFor(ana, roomId, 10, 11);

    const result = await cancelBooking(edge(BEFORE), { ...ana, userId: colleagueId }, id);
    expect(result.ok).toBe(true);
  });

  it("another company's booking is not_found and stays confirmed (P-3)", async () => {
    const [ana, gus] = [await member("cancel-owner"), await member("cancel-intruder")];
    const roomId = await createRoom(owner);
    const id = await bookFor(ana, roomId, 10, 11);

    expect(await cancelBooking(edge(BEFORE), gus, id)).toEqual({ ok: false, reason: "not_found" });
    expect(await cancelBooking(edge(BEFORE), gus, "no-such-booking")).toEqual({ ok: false, reason: "not_found" });
    expect(await operator.booking.findUnique({ where: { id } })).toMatchObject({ status: "confirmed" });
  });

  it("a second cancel is already_cancelled and keeps the first cancelled_at", async () => {
    const ana = await member("cancel-twice");
    const roomId = await createRoom(owner);
    const id = await bookFor(ana, roomId, 10, 11);
    await cancelBooking(edge(BEFORE), ana, id);

    const later = new Date(BEFORE.getTime() + 60_000);
    expect(await cancelBooking(edge(later), ana, id)).toEqual({ ok: false, reason: "already_cancelled" });
    expect(await operator.booking.findUnique({ where: { id } })).toMatchObject({ cancelledAt: BEFORE });
  });

  it("a booking that started is cancel_not_allowed, at the exact start too, and stays confirmed", async () => {
    const ana = await member("cancel-started");
    const roomId = await createRoom(owner);
    const id = await bookFor(ana, roomId, 10, 11);

    expect(await cancelBooking(edge(at(DAY, 10)), ana, id)).toEqual({ ok: false, reason: "cancel_not_allowed" });
    expect(await cancelBooking(edge(at(DAY, 10.5)), ana, id)).toEqual({ ok: false, reason: "cancel_not_allowed" });
    expect(await operator.booking.findUnique({ where: { id } })).toMatchObject({ status: "confirmed" });
  });

  it("a deactivated company can still cancel what it holds", async () => {
    const ana = await member("cancel-inactive");
    const roomId = await createRoom(owner);
    const id = await bookFor(ana, roomId, 10, 11);
    await owner.company.update({ where: { id: ana.tenantId }, data: { deactivatedAt: BEFORE } });

    expect(await cancelBooking(edge(BEFORE), ana, id)).toMatchObject({ ok: true });
  });

  it("the operator cannot cancel (P-12 grants: no write on booking)", async () => {
    const ana = await member("cancel-operator");
    const roomId = await createRoom(owner);
    const id = await bookFor(ana, roomId, 10, 11);

    await expect(operator.booking.update({ where: { id }, data: { status: "cancelled" } })).rejects.toThrow();
  });

  it("two simultaneous cancels give one success and one already_cancelled (P-12)", async () => {
    const ana = await member("cancel-race");
    const roomId = await createRoom(owner);
    const id = await bookFor(ana, roomId, 10, 11);

    const results = await Promise.all(Array.from({ length: 6 }, () => cancelBooking(edge(BEFORE), ana, id)));

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const refused = results.filter((result) => !result.ok);
    expect(refused).toHaveLength(5);
    expect(refused.every((result) => !result.ok && result.reason === "already_cancelled")).toBe(true);
  });
});
