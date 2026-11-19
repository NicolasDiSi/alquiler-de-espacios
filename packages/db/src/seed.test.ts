import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { runPrisma } from "./testing/prisma-cli";

const urls = inject("databaseUrls");
const operator = createDatabaseClient(urls.operatorUrl);

afterAll(async () => {
  await operator.$disconnect();
});

function seed(): void {
  const result = runPrisma(["db", "execute", "--file", "prisma/seed.sql"], urls.ownerUrl);
  if (result.status !== 0) throw new Error(`seed failed:\n${result.output}`);
}

async function counts() {
  const [rooms, companies, users, bookings] = await Promise.all([
    operator.room.count({
      where: { id: { startsWith: "room-" }, name: { in: ["Sala Sol", "Sala Luna", "Sala Mar"] } },
    }),
    operator.company.count({ where: { id: { in: ["company-acme", "company-globex", "company-initech"] } } }),
    operator.appUser.count({ where: { id: { startsWith: "user-" }, name: { not: { startsWith: "user-" } } } }),
    operator.booking.count({ where: { id: { startsWith: "seed-" } } }),
  ]);
  return { rooms, companies, users, bookings };
}

describe("db:seed (spec 0001 P-13)", () => {
  it("fills the database under FORCE row level security, and a second run adds nothing", async () => {
    seed();
    const first = await counts();
    expect(first.rooms).toBe(3);
    expect(first.companies).toBe(3);
    expect(first.users).toBe(5);
    expect(first.bookings).toBeGreaterThanOrEqual(25);
    expect(first.bookings).toBeLessThanOrEqual(60);

    seed();
    expect(await counts()).toEqual(first);
  });

  it("spreads bookings over every company and room, with confirmed and cancelled ones", async () => {
    seed();
    const byTenant = await operator.booking.groupBy({
      by: ["tenantId"],
      where: { id: { startsWith: "seed-" } },
      _count: true,
    });
    const byRoom = await operator.booking.groupBy({
      by: ["roomId"],
      where: { id: { startsWith: "seed-" } },
      _count: true,
    });
    const byStatus = await operator.booking.groupBy({
      by: ["status"],
      where: { id: { startsWith: "seed-" } },
      _count: true,
    });
    expect(byTenant).toHaveLength(3);
    expect(byRoom).toHaveLength(3);
    expect(byStatus.map((row) => row.status).sort()).toEqual(["cancelled", "confirmed"]);
  });

  it("follows the booking rules: weekdays, 08:00 to 20:00 in Buenos Aires, a 30 minute grid, at most 4 hours", async () => {
    seed();
    const [row] = await operator.$queryRaw<{ bad: bigint }[]>`
      SELECT count(*) AS bad
      FROM booking b,
        LATERAL (SELECT b.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires' AS s,
                        b.ends_at AT TIME ZONE 'America/Argentina/Buenos_Aires' AS e) AS local
      WHERE b.id LIKE 'seed-%'
        AND NOT (
          extract(isodow FROM local.s) BETWEEN 1 AND 5
          AND local.s::date = local.e::date
          AND local.s::time >= time '08:00' AND local.e::time <= time '20:00'
          AND extract(minute FROM local.s)::int % 30 = 0 AND extract(minute FROM local.e)::int % 30 = 0
          AND b.ends_at - b.starts_at BETWEEN interval '30 minutes' AND interval '4 hours'
          AND (b.status = 'cancelled') = (b.cancelled_at IS NOT NULL)
        )`;
    expect(Number(row?.bad)).toBe(0);
  });
});
