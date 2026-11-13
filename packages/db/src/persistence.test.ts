import { bookRoom, listMyBookings } from "@espacios/application";
import { type Actor, type LocalDate, type UserId, zonedInstant } from "@espacios/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseClient } from "./client";
import { createUuidV7Generator } from "./ids";
import { createPrismaRoomCatalog } from "./room-catalog";
import { createMember, createRoom, createTenant } from "./testing/fixtures";
import { type DatabaseUrls, startDatabase, urlsOf } from "./testing/global-setup";
import { createPrismaUnitOfWork } from "./unit-of-work";

const at = (date: string, hours: number) =>
  zonedInstant(date as LocalDate, hours * 60, "America/Argentina/Buenos_Aires");

// Monday 2030-01-07, 09:00 in Buenos Aires. The booking goes on Tuesday the 8th.
const NOW = at("2030-01-07", 9);
const SLOT = { startsAt: at("2030-01-08", 10), endsAt: at("2030-01-08", 11) };

/** The app's edge on fresh connections, as a process that just started would open them. */
function appEdge(urls: DatabaseUrls) {
  const runtime = createDatabaseClient(urls.runtimeUrl);
  const deps = {
    uow: createPrismaUnitOfWork(runtime),
    clock: { now: () => NOW },
    ids: createUuidV7Generator(),
    rooms: createPrismaRoomCatalog(runtime),
  };
  return { deps, close: () => runtime.$disconnect() };
}

async function member(owner: DatabaseClient, name: string): Promise<Actor & { role: "member" }> {
  const tenantId = await createTenant(owner, name);
  return { role: "member", tenantId, userId: (await createMember(owner, tenantId)) as UserId };
}

// Its own container: restarting the shared one would take the database away from every other suite mid run.
let database: Awaited<ReturnType<typeof startDatabase>>;
beforeAll(async () => {
  database = await startDatabase();
});
afterAll(async () => {
  await database?.container.stop();
});

describe("bookings survive a restart (brief: 'Bookings must survive an application restart')", () => {
  it("keeps a booking and its overlap guarantee after the app's connections close and Postgres restarts", async () => {
    const owner = createDatabaseClient(database.urls.ownerUrl);
    const [acme, globex] = [await member(owner, "persist-acme"), await member(owner, "persist-globex")];
    const roomId = await createRoom(owner);
    await owner.$disconnect();

    // The app books, then its process ends: every connection it held is closed.
    const before = appEdge(database.urls);
    const booked = await bookRoom(before.deps, acme, { roomId, ...SLOT });
    expect(booked.ok).toBe(true);
    await before.close();

    // The database server restarts too, so nothing can come from a cache or an open transaction.
    await database.container.restart();
    const after = appEdge(urlsOf(database.container));
    try {
      const page = await listMyBookings(after.deps, acme, { view: "upcoming", after: null, limit: 50 });
      expect(page.ok && page.value.bookings.map((booking) => booking.id)).toEqual([
        booked.ok ? booked.value.booking.id : "",
      ]);
      // The slot is still taken for everyone else: the exclusion constraint came back with the data.
      expect(await bookRoom(after.deps, globex, { roomId, ...SLOT })).toEqual({ ok: false, reason: "conflict" });
    } finally {
      await after.close();
    }
  });
});
