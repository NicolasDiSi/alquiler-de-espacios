import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export type DatabaseUrls = {
  /** Schema owner: not subject to row-level security. Used to seed fixtures. */
  readonly ownerUrl: string;
  /** The runtime login, exactly as the apps connect. */
  readonly runtimeUrl: string;
};

declare module "vitest" {
  interface ProvidedContext {
    databaseUrls: DatabaseUrls;
  }
}

/** The db package root. Vitest may run from the repo root (lint-staged, the root config), so never rely on cwd. */
const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Setup errors are printed as plain messages and end the run. Thrown errors would reach Vitest's reporter, whose
 * source map lookup crashes on them and shows only "No test files found".
 */
function abort(reason: string): never {
  console.error(`\n@espacios/db test setup failed: ${reason}\n`);
  process.exit(1);
}

function assertDockerIsRunning(): void {
  try {
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "pipe", timeout: 15_000 });
  } catch {
    abort(
      "these tests need Docker to start a throwaway Postgres with testcontainers. " +
        "Start Docker Desktop (or the Docker engine) and run the tests again.",
    );
  }
}

async function migrate(container: StartedPostgreSqlContainer): Promise<void> {
  try {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: PACKAGE_DIR,
      env: { ...process.env, DATABASE_OWNER_URL: container.getConnectionUri() },
      stdio: "pipe",
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? String(error);
    await container.stop();
    abort(`prisma migrate deploy failed.\n${output}`);
  }
}

/** One Postgres for the whole run, migrated with the real migrations, with the runtime login the apps use. */
export default async function setup(project: TestProject) {
  assertDockerIsRunning();
  const container = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("espacios")
    .withUsername("espacios")
    .withPassword("espacios")
    .start();
  const ownerUrl = container.getConnectionUri();

  const created = await container.exec([
    "psql",
    "-U",
    "espacios",
    "-d",
    "espacios",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    // Same roles as infra/local/postgres/01-runtime-role.sql; migrations only grant to them.
    "CREATE ROLE espacios_runtime NOLOGIN; CREATE ROLE espacios_app LOGIN PASSWORD 'espacios_app' IN ROLE espacios_runtime",
  ]);
  if (created.exitCode !== 0) {
    await container.stop();
    abort(`could not create the runtime login.\n${created.output}`);
  }
  await migrate(container);

  project.provide("databaseUrls", {
    ownerUrl,
    runtimeUrl: ownerUrl.replace("espacios:espacios@", "espacios_app:espacios_app@"),
  });

  return async () => {
    await container.stop();
  };
}
