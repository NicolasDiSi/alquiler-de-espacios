import { describe, expect, it } from "vitest";

import type { TenantId } from "../shared/brand";
import { type Actor, authorizeMember, authorizeOperator, type UserId } from "./actor";

const member: Actor = { role: "member", userId: "user-ana" as UserId, tenantId: "company-acme" as TenantId };
const operator: Actor = { role: "operator", userId: "user-operador" as UserId };

describe("authorizeMember", () => {
  it("lets a member into the company edge with its own company", () => {
    expect(authorizeMember(member)).toEqual({ ok: true, value: member });
  });

  it("refuses the operator with forbidden and a reason", () => {
    const result = authorizeMember(operator);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden");
      expect(result.error.message).not.toBe("");
    }
  });
});

describe("authorizeOperator", () => {
  it("lets the operator into the operator edge", () => {
    expect(authorizeOperator(operator)).toEqual({ ok: true, value: operator });
  });

  it("refuses a member with forbidden and a reason", () => {
    const result = authorizeOperator(member);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden");
      expect(result.error.message).not.toBe("");
    }
  });
});
