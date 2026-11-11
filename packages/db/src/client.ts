import { PrismaPg } from "@prisma/adapter-pg";

import { type Prisma, PrismaClient } from "./generated/prisma/client";

export type DatabaseClient = PrismaClient;
export type TransactionClient = Prisma.TransactionClient;

/**
 * One client per connection string and process. The runtime client must use the espacios_app login (DATABASE_URL);
 * only system jobs that work across tenants use the owner connection.
 */
export function createDatabaseClient(connectionString: string): DatabaseClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
