import { describe, expect, inject, it } from "vitest";

import { runPrisma } from "./testing/prisma-cli";

const { ownerUrl } = inject("databaseUrls");

describe("schema drift (spec 0001 P-15)", () => {
  it("has no difference between the migrated database and prisma/schema.prisma", () => {
    // Exit code 0: nothing differs. 2: a model or a migration was changed without the other.
    const result = runPrisma(
      ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
      ownerUrl,
    );
    expect(result.output).not.toContain("[+]");
    expect(result.status).toBe(0);
  });

  it("has every migration applied", () => {
    const result = runPrisma(["migrate", "status"], ownerUrl);
    expect(result.output).toContain("Database schema is up to date");
  });
});
