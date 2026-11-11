import type { TenantId, UserId } from "@espacios/domain";

/** A seeded user as the session needs it: who they are and, for a member, the company they act for. */
export type DirectoryUser =
  | {
      readonly role: "member";
      readonly id: UserId;
      readonly name: string;
      readonly company: { readonly id: TenantId; readonly name: string };
    }
  | { readonly role: "operator"; readonly id: UserId; readonly name: string };

/** The picker screen: every company with its members, and the operators apart. Names are not private (spec 0001). */
export type SignInChoicesView = {
  readonly companies: readonly {
    readonly id: TenantId;
    readonly name: string;
    readonly users: readonly { readonly id: UserId; readonly name: string }[];
  }[];
  readonly operators: readonly { readonly id: UserId; readonly name: string }[];
};

/**
 * Reads seeded users before any tenant is known (the picker, the session cookie). `company` and `app_user` have no
 * row level security, so this runs on the runtime login without a tenant transaction.
 */
export interface UserDirectory {
  findUser(id: UserId): Promise<DirectoryUser | null>;
  listSignInChoices(): Promise<SignInChoicesView>;
}
