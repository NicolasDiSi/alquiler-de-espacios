import type { DirectoryUser, SignInChoicesView, UserDirectory } from "@espacios/application";
import type { TenantId, UserId } from "@espacios/domain";

import type { DatabaseClient } from "./client";

/**
 * Reads `app_user` and `company`, which have no row level security, on the runtime login (`espacios_app` has
 * `SELECT` on both). No tenant is set, because the picker and the session cookie run before one is known.
 */
export function createPrismaUserDirectory(db: DatabaseClient): UserDirectory {
  return {
    async findUser(id) {
      const user = await db.appUser.findUnique({
        where: { id },
        select: { id: true, name: true, role: true, company: { select: { id: true, name: true } } },
      });
      if (!user) return null;
      return toDirectoryUser(user);
    },

    async listSignInChoices() {
      const users = await db.appUser.findMany({
        select: { id: true, name: true, role: true, company: { select: { id: true, name: true, kind: true } } },
        orderBy: [{ company: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
      });
      const kinds = new Map(users.flatMap((user) => (user.company ? [[user.company.id, user.company.kind]] : [])));
      return groupByCompany(
        users.map(toDirectoryUser).filter((user) => user !== null),
        (id) => kinds.get(id) ?? "company",
      );
    },
  };
}

type CompanyKind = SignInChoicesView["companies"][number]["kind"];

type UserRow = {
  id: string;
  name: string;
  role: "member" | "operator";
  company: { id: string; name: string } | null;
};

/** The CHECK on `app_user` ties the role to the company; a row that breaks it is skipped, never trusted. */
function toDirectoryUser(row: UserRow): DirectoryUser | null {
  const id = row.id as UserId;
  if (row.role === "operator") return row.company ? null : { role: "operator", id, name: row.name };
  if (!row.company) return null;
  return { role: "member", id, name: row.name, company: { id: row.company.id as TenantId, name: row.company.name } };
}

/** Users arrive sorted by company name, then user name, so the groups keep that order. */
function groupByCompany(users: DirectoryUser[], kindOf: (id: string) => CompanyKind): SignInChoicesView {
  const companies = new Map<
    string,
    { id: TenantId; name: string; kind: CompanyKind; users: { id: UserId; name: string }[] }
  >();
  const operators: { id: UserId; name: string }[] = [];
  for (const user of users) {
    if (user.role === "operator") {
      operators.push({ id: user.id, name: user.name });
      continue;
    }
    const group = companies.get(user.company.id) ?? { ...user.company, kind: kindOf(user.company.id), users: [] };
    group.users.push({ id: user.id, name: user.name });
    companies.set(user.company.id, group);
  }
  return { companies: [...companies.values()], operators };
}
