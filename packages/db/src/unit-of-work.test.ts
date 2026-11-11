import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createTenant, randomIds } from "./testing/fixtures";
import { createPrismaUnitOfWork } from "./unit-of-work";

const { ownerUrl, runtimeUrl } = inject("databaseUrls");
const owner = createDatabaseClient(ownerUrl);
// One connection, so a leaked session setting would be visible to the next statement.
const runtime = createDatabaseClient(`${runtimeUrl}?connection_limit=1`);
const uow = createPrismaUnitOfWork(runtime, randomIds);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
});

async function currentTenantSetting(): Promise<string | null> {
  const [row] = await runtime.$queryRaw<{ value: string | null }[]>`
    SELECT current_setting('app.tenant_id', true) AS value`;
  return row?.value ?? null;
}

describe("prisma unit of work (runtime role)", () => {
  it("returns what the work returns", async () => {
    const tenantId = await createTenant(owner, "acme");
    await expect(uow.run(tenantId, async () => "done")).resolves.toBe("done");
  });

  it("keeps the tenant setting inside the transaction", async () => {
    const tenantId = await createTenant(owner, "globex");
    await uow.run(tenantId, async () => undefined);
    expect(await currentTenantSetting()).toBeFalsy();
  });

  it("rolls back and rethrows when the work throws", async () => {
    const tenantId = await createTenant(owner, "initech");
    await expect(
      uow.run(tenantId, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await currentTenantSetting()).toBeFalsy();
  });

  it("lets the runtime read companies but not write them", async () => {
    const tenantId = await createTenant(owner, "umbrella");
    await expect(runtime.company.findUnique({ where: { id: tenantId } })).resolves.toMatchObject({ name: "umbrella" });
    await expect(runtime.company.create({ data: { id: "intruder", name: "x", slug: "intruder" } })).rejects.toThrow();
  });
});
