import type { TenantId, UserId } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import type { DirectoryUser, UserDirectory } from "../ports/queries/user-directory";
import { resolveSession } from "./identity";

const ana: DirectoryUser = {
  role: "member",
  id: "user-acme-ana" as UserId,
  name: "Ana (Acme)",
  company: { id: "company-acme" as TenantId, name: "Acme SA" },
};
const operador: DirectoryUser = { role: "operator", id: "user-operador" as UserId, name: "Operador" };

function directoryOf(...users: DirectoryUser[]): UserDirectory {
  return {
    findUser: async (id) => users.find((user) => user.id === id) ?? null,
    listSignInChoices: async () => ({ companies: [], operators: [] }),
  };
}

describe("resolveSession", () => {
  it("gives a member the company of its own user row", async () => {
    const session = await resolveSession(directoryOf(ana, operador), ana.id);
    expect(session).toEqual({
      actor: { role: "member", userId: "user-acme-ana", tenantId: "company-acme" },
      userName: "Ana (Acme)",
      companyName: "Acme SA",
    });
  });

  it("gives the operator no company", async () => {
    const session = await resolveSession(directoryOf(ana, operador), operador.id);
    expect(session).toEqual({
      actor: { role: "operator", userId: "user-operador" },
      userName: "Operador",
      companyName: null,
    });
  });

  it("returns null for a user that no longer exists", async () => {
    await expect(resolveSession(directoryOf(ana), "user-gone" as UserId)).resolves.toBeNull();
  });
});
