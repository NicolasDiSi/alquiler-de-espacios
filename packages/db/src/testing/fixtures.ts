import type { TenantId } from "@espacios/domain";

import type { DatabaseClient, TransactionClient } from "../client";
import { randomUUID } from "node:crypto";

/** Writes a client company through the owner connection. `company` has no row level security. */
export async function createTenant(owner: DatabaseClient, name: string): Promise<TenantId> {
  const suffix = randomUUID().slice(0, 8);
  const tenantId = `company-${name}-${suffix}` as TenantId;
  await owner.company.create({ data: { id: tenantId, name, slug: `${name}-${suffix}` } });
  return tenantId;
}

/**
 * A facility that is always open (UTC, every day, 00:00 to 24:00), so the fixed UTC times of `at()` never fall outside
 * the opening window the booking guard checks. Created once and reused.
 */
export const TEST_FACILITY_ID = "facility-test-always-open";

async function ensureTestFacility(owner: DatabaseClient): Promise<string> {
  // Test files run in parallel against one database, so this must be atomic: a find then create would race.
  await owner.$executeRaw`
    INSERT INTO facility (id, name, time_zone, opens_at, closes_at, open_weekdays)
    VALUES (${TEST_FACILITY_ID}, 'Test facility (always open)', 'UTC', 0, 1440, ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[])
    ON CONFLICT DO NOTHING`;
  return TEST_FACILITY_ID;
}

/** A room of its own, so a test never overlaps another test's bookings. Rooms have no row level security. */
export async function createRoom(owner: DatabaseClient, facilityId?: string): Promise<string> {
  const id = `room-${randomUUID()}`;
  await owner.room.create({
    data: { id, name: id, capacity: 6, facilityId: facilityId ?? (await ensureTestFacility(owner)) },
  });
  return id;
}

/** A member of a company, the user a booking is made by. */
export async function createMember(owner: DatabaseClient, tenantId: string): Promise<string> {
  const id = `user-${randomUUID()}`;
  await owner.appUser.create({ data: { id, tenantId, name: id, role: "member" } });
  return id;
}

/** Runs the work in one transaction for one company, the way the unit of work does. Works for any login. */
export function asTenant<T>(
  client: DatabaseClient,
  tenantId: string,
  work: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return work(tx);
  });
}

/** Times as hours on one fixed UTC day, so a test reads as "10 to 12" and never depends on the clock. */
export function at(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2030, 0, 7, hour, minute));
}

export type NewBooking = {
  readonly tenantId: string;
  readonly roomId: string;
  readonly bookedBy: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
};

/** Inserts a confirmed booking for its company, as the given login. Returns the booking id. */
export async function book(client: DatabaseClient, booking: NewBooking): Promise<string> {
  const id = `booking-${randomUUID()}`;
  await asTenant(client, booking.tenantId, (tx) => tx.booking.create({ data: { id, ...booking } }));
  return id;
}
