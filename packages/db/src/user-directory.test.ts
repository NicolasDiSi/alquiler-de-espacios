import type { UserId } from "@espacios/domain";
import { afterAll, describe, expect, inject, it } from "vitest";

import { createDatabaseClient } from "./client";
import { createMember, createTenant } from "./testing/fixtures";
import { createPrismaUserDirectory } from "./user-directory";
import { randomUUID } from "node:crypto";

const { ownerUrl, runtimeUrl } = inject("databaseUrls");
const owner = createDatabaseClient(ownerUrl);
// The login the web app uses: the directory must work without a tenant set and without BYPASSRLS.
const runtime = createDatabaseClient(runtimeUrl);
const directory = createPrismaUserDirectory(runtime);

afterAll(async () => {
  await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
});

async function createOperator(): Promise<UserId> {
  const id = `user-operator-${randomUUID()}`;
  await owner.appUser.create({ data: { id, tenantId: null, name: id, role: "operator" } });
  return id as UserId;
}

describe("prisma user directory (runtime role, no tenant set)", () => {
  it("finds a member with the company of its own row", async () => {
    const tenantId = await createTenant(owner, "acme");
    const userId = (await createMember(owner, tenantId)) as UserId;

    await expect(directory.findUser(userId)).resolves.toEqual({
      role: "member",
      id: userId,
      name: userId,
      company: { id: tenantId, name: "acme" },
    });
  });

  it("finds the operator with no company", async () => {
    const operatorId = await createOperator();
    await expect(directory.findUser(operatorId)).resolves.toEqual({
      role: "operator",
      id: operatorId,
      name: operatorId,
    });
  });

  it("returns null for an unknown user, so the session is refused", async () => {
    await expect(directory.findUser("user-does-not-exist" as UserId)).resolves.toBeNull();
  });

  it("lists every company with its members, and the operators apart", async () => {
    const globex = await createTenant(owner, "globex");
    const initech = await createTenant(owner, "initech");
    const carla = await createMember(owner, globex);
    const diego = await createMember(owner, initech);
    const operatorId = await createOperator();

    const choices = await directory.listSignInChoices();

    const globexGroup = choices.companies.find((company) => company.id === globex);
    expect(globexGroup).toEqual({ id: globex, name: "globex", kind: "company", users: [{ id: carla, name: carla }] });
    expect(choices.companies.find((company) => company.id === initech)?.users).toEqual([{ id: diego, name: diego }]);
    expect(choices.operators).toContainEqual({ id: operatorId, name: operatorId });
    // A member never shows up as an operator, and the operator never inside a company.
    expect(choices.operators.map((user) => user.id)).not.toContain(carla);
    expect(choices.companies.flatMap((company) => company.users).map((user) => user.id)).not.toContain(operatorId);
  });
});
