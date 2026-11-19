import type { Brand, TenantId } from "../shared/brand";
import { fail, ok, type Result } from "../shared/result";

/** A seeded user. The picker and the session cookie carry it; the company is always looked up from it. */
export type UserId = Brand<string, "UserId">;

export const USER_ROLES = ["member", "operator"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** A member acts for exactly one client company. */
export type MemberActor = {
  readonly role: "member";
  readonly userId: UserId;
  readonly tenantId: TenantId;
};

/** The rental company's staff: reads every company, belongs to none. */
export type OperatorActor = {
  readonly role: "operator";
  readonly userId: UserId;
};

/** Who is acting, resolved on the server from the signed session, never from the request. */
export type Actor = MemberActor | OperatorActor;

/** The company edge (book, cancel, my bookings) is for members only. */
export function authorizeMember(actor: Actor): Result<MemberActor> {
  if (actor.role === "member") return ok(actor);
  return fail("forbidden");
}

/** The operator edge (metrics, every company's bookings) is for the operator only. */
export function authorizeOperator(actor: Actor): Result<OperatorActor> {
  if (actor.role === "operator") return ok(actor);
  return fail("forbidden");
}
