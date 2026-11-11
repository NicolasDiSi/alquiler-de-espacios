import { describe, expect, it } from "vitest";

import type { TenantId } from "../shared/brand";
import { type Actor, authorizeMember, authorizeOperator, type UserId } from "./actor";

const member: Actor = { role: "member", userId: "user-ana" as UserId, tenantId: "company-acme" as TenantId };
const operator: Actor = { role: "operator", userId: "user-operador" as UserId };

describe("authorizeMember", () => {
  it("lets a member into the company edge with its own company", () => {
    expect(authorizeMember(member)).toEqual({ ok: true, value: member });
  });

  it("refuses the operator with forbidden", () => {
    const result = authorizeMember(operator);
    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("authorizeOperator", () => {
  it("lets the operator into the operator edge", () => {
    expect(authorizeOperator(operator)).toEqual({ ok: true, value: operator });
  });

  it("refuses a member with forbidden", () => {
    const result = authorizeOperator(member);
    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });
});
