import type { Session } from "@espacios/application";
import type { TenantId, UserId } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import { checkAccess, checkStateChange } from "./access";

const member: Session = {
  actor: { role: "member", userId: "user-acme-ana" as UserId, tenantId: "company-acme" as TenantId },
  userName: "Ana (Acme)",
  companyName: "Acme SA",
};
const operator: Session = {
  actor: { role: "operator", userId: "user-operador" as UserId },
  userName: "Operador",
  companyName: null,
};

describe("checkAccess", () => {
  it.each(["any", "member", "operator"] as const)("answers 401 without a session (%s edge)", (edge) => {
    expect(checkAccess(null, edge)).toEqual({ status: 401, code: "unauthenticated" });
  });

  it("lets any signed in user through the shared edge", () => {
    expect(checkAccess(member, "any")).toBeNull();
    expect(checkAccess(operator, "any")).toBeNull();
  });

  it("keeps a member out of operator routes with 403", () => {
    expect(checkAccess(member, "operator")).toEqual({ status: 403, code: "forbidden" });
    expect(checkAccess(member, "member")).toBeNull();
  });

  it("keeps the operator out of member routes with 403", () => {
    expect(checkAccess(operator, "member")).toEqual({ status: 403, code: "forbidden" });
    expect(checkAccess(operator, "operator")).toBeNull();
  });
});

describe("checkStateChange", () => {
  const json = { "content-type": "application/json", host: "localhost:3000" };

  it("does not check reads", () => {
    expect(checkStateChange("GET", new Headers({ origin: "https://evil.example", host: "localhost:3000" }))).toBeNull();
  });

  it("allows a same origin JSON post, and one with no Origin", () => {
    expect(checkStateChange("POST", new Headers({ ...json, origin: "http://localhost:3000" }))).toBeNull();
    expect(checkStateChange("POST", new Headers(json))).toBeNull();
  });

  it("refuses a cross origin post with 403", () => {
    const headers = new Headers({ ...json, origin: "http://localhost:4000" });
    expect(checkStateChange("POST", headers)).toEqual({ status: 403, code: "forbidden" });
  });

  it("refuses a post that is not JSON with 400", () => {
    const headers = new Headers({ host: "localhost:3000", "content-type": "application/x-www-form-urlencoded" });
    expect(checkStateChange("post", headers)).toEqual({ status: 400, code: "invalid_input" });
  });
});
