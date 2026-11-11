import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export type DatabaseUrls = {
  /** Schema owner (espacios_owner): not a superuser, so FORCE row level security applies to it. Used for fixtures. */
  readonly ownerUrl: string;
  /** The runtime login (espacios_app), exactly as the apps connect. */
  readonly runtimeUrl: string;
  /** The operator login (espacios_operator): BYPASSRLS, SELECT only. */
  readonly operatorUrl: string;
  /** The container superuser. Only for checks about roles; never what the app or the migrations use. */
  readonly adminUrl: string;
};

declare module "vitest" {
  interface ProvidedContext {
    databaseUrls: DatabaseUrls;
  }
}

/** The db package root. Vitest may run from the repo root (lint-staged, the root config), so never rely on cwd. */
const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));
/** The same init SQL docker compose runs, so the tests use the real roles and not a copy of them. */
const ROLES_SQL = fileURLToPath(new URL("../../../../infra/local/postgres/01-roles.sql", import.meta.url));

/** One URL per login of the container. */
function loginUrl(adminUrl: string, login: string): string {
  return adminUrl.replace("espacios:espacios@", `${login}:${login}@`);
}

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
      env: { ...process.env, DATABASE_OWNER_URL: loginUrl(container.getConnectionUri(), "espacios_owner") },
      stdio: "pipe",
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? String(error);
    await container.stop();
    abort(`prisma migrate deploy failed.\n${output}`);
  }
}

/** One Postgres for the whole run, with the real roles, migrated with the real migrations, as the owner role. */
export default async function setup(project: TestProject) {
  assertDockerIsRunning();
  const container = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("espacios")
    .withUsername("espacios")
    .withPassword("espacios")
    // The postgres image runs everything in this folder once, as the superuser, before accepting connections.
    .withCopyFilesToContainer([{ source: ROLES_SQL, target: "/docker-entrypoint-initdb.d/01-roles.sql" }])
    .start();
  const adminUrl = container.getConnectionUri();

  await migrate(container);

  project.provide("databaseUrls", {
    adminUrl,
    ownerUrl: loginUrl(adminUrl, "espacios_owner"),
    runtimeUrl: loginUrl(adminUrl, "espacios_app"),
    operatorUrl: loginUrl(adminUrl, "espacios_operator"),
  });

  return async () => {
    await container.stop();
  };
}
