import type { TenantId } from "@espacios/domain";

import type { DatabaseClient } from "../client";
import { randomUUID } from "node:crypto";

export const randomIds = { next: () => randomUUID() };

/** Writes a client company through the owner connection, which is not subject to row-level security. */
export async function createTenant(owner: DatabaseClient, name: string): Promise<TenantId> {
  const suffix = randomUUID().slice(0, 8);
  const tenantId = `company-${name}-${suffix}` as TenantId;
  await owner.company.create({ data: { id: tenantId, name, slug: `${name}-${suffix}` } });
  return tenantId;
}
