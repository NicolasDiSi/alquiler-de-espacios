import { defineConfig } from "prisma/config";

/**
 * The CLI (migrate, studio, seed) connects as the schema owner. The app connects as the runtime role through
 * DATABASE_URL, where row-level security applies. See docs/adr/0003-prisma-multitenancy.md.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // The fallback is the local compose.yaml database; every deployed environment sets DATABASE_OWNER_URL.
    // biome-ignore lint/security/noSecrets: local development credentials from compose.yaml, not a secret.
    url: process.env.DATABASE_OWNER_URL ?? "postgresql://espacios_owner:espacios_owner@localhost:5432/espacios",
  },
});
