import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { asTenant, at, book, createMember, createRoom, createTenant } from "./testing/fixtures";
import { sqlStateOf } from "./testing/sql-state";

const urls = inject("databaseUrls");
const admin = createDatabaseClient(urls.adminUrl);
const owner = createDatabaseClient(urls.ownerUrl);
const runtime = createDatabaseClient(urls.runtimeUrl);
const operator = createDatabaseClient(urls.operatorUrl);

afterAll(async () => {
  await Promise.all([admin.$disconnect(), owner.$disconnect(), runtime.$disconnect(), operator.$disconnect()]);
});

type RoleRow = {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcanlogin: boolean;
  rolcreatedb: boolean;
};

async function role(name: string): Promise<RoleRow> {
  const rows = await admin.$queryRaw<RoleRow[]>`
    SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb FROM pg_roles WHERE rolname = ${name}`;
  const row = rows[0];
  if (!row) throw new Error(`role ${name} does not exist`);
  return row;
}

describe("database roles (spec 0001, Database roles and connections)", () => {
  it("the app login and the owner are neither superusers nor BYPASSRLS, so row level security applies", async () => {
    expect(await role("espacios_app")).toMatchObject({ rolsuper: false, rolbypassrls: false, rolcanlogin: true });
    expect(await role("espacios_owner")).toMatchObject({ rolsuper: false, rolbypassrls: false, rolcanlogin: true });
  });

  it("the operator login bypasses row level security but is not a superuser", async () => {
    expect(await role("espacios_operator")).toMatchObject({ rolsuper: false, rolbypassrls: true, rolcanlogin: true });
  });

  it("the availability owner cannot log in", async () => {
    expect(await role("espacios_availability")).toMatchObject({
      rolsuper: false,
      rolbypassrls: true,
      rolcanlogin: false,
    });
  });

  it("the app login owns no table, so it cannot sidestep its own policies", async () => {
    const rows = await admin.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'espacios_app'`;
    expect(rows).toEqual([]);
  });
});

describe("the runtime login (companies)", () => {
  it("reads companies, rooms and users but cannot change them", async () => {
    const tenantId = await createTenant(owner, "readonly");
    const roomId = await createRoom(owner);
    const userId = await createMember(owner, tenantId);

    await expect(runtime.company.findUnique({ where: { id: tenantId } })).resolves.not.toBeNull();
    await expect(runtime.room.findUnique({ where: { id: roomId } })).resolves.not.toBeNull();
    await expect(runtime.appUser.findUnique({ where: { id: userId } })).resolves.not.toBeNull();

    expect(await sqlStateOf(runtime.room.update({ where: { id: roomId }, data: { capacity: 99 } }))).toBe("42501");
    expect(await sqlStateOf(runtime.company.update({ where: { id: tenantId }, data: { name: "x" } }))).toBe("42501");
    expect(await sqlStateOf(runtime.appUser.update({ where: { id: userId }, data: { name: "x" } }))).toBe("42501");
  });

  it("cannot delete bookings", async () => {
    const tenantId = await createTenant(owner, "nodelete");
    const roomId = await createRoom(owner);
    const bookedBy = await createMember(owner, tenantId);
    const id = await book(runtime, { tenantId, roomId, bookedBy, startsAt: at(9), endsAt: at(10) });

    expect(await sqlStateOf(asTenant(runtime, tenantId, (tx) => tx.booking.delete({ where: { id } })))).toBe("42501");
  });
});

describe("the operator login (spec 0001, P-5)", () => {
  it("reads every company's bookings and the shared tables", async () => {
    const roomId = await createRoom(owner);
    const tenantA = await createTenant(owner, "opa");
    const tenantB = await createTenant(owner, "opb");
    const [userA, userB] = [await createMember(owner, tenantA), await createMember(owner, tenantB)];
    const a = await book(runtime, { tenantId: tenantA, roomId, bookedBy: userA, startsAt: at(9), endsAt: at(10) });
    const b = await book(runtime, { tenantId: tenantB, roomId, bookedBy: userB, startsAt: at(11), endsAt: at(12) });

    // No tenant is set on this connection: row level security would hide everything from a normal login.
    const rows = await operator.booking.findMany({ where: { roomId }, select: { id: true } });
    expect(rows.map((row) => row.id).sort()).toEqual([a, b].sort());
    await expect(operator.company.count()).resolves.toBeGreaterThanOrEqual(2);
    await expect(operator.room.count()).resolves.toBeGreaterThanOrEqual(1);
    await expect(operator.appUser.count()).resolves.toBeGreaterThanOrEqual(2);
  });

  it("cannot insert, update or delete anything", async () => {
    const tenantId = await createTenant(owner, "opro");
    const roomId = await createRoom(owner);
    const bookedBy = await createMember(owner, tenantId);
    const id = await book(runtime, { tenantId, roomId, bookedBy, startsAt: at(9), endsAt: at(10) });

    const insert = operator.booking.create({
      data: { id: "op-insert", tenantId, roomId, bookedBy, startsAt: at(13), endsAt: at(14) },
    });
    expect(await sqlStateOf(insert)).toBe("42501");
    expect(await sqlStateOf(operator.booking.update({ where: { id }, data: { status: "cancelled" } }))).toBe("42501");
    expect(await sqlStateOf(operator.booking.delete({ where: { id } }))).toBe("42501");
    expect(await sqlStateOf(operator.room.update({ where: { id: roomId }, data: { capacity: 1 } }))).toBe("42501");
    expect(await sqlStateOf(operator.company.delete({ where: { id: tenantId } }))).toBe("42501");
  });
});
