// The Playwright web server: a throwaway Postgres (testcontainers) with the real roles, migrations and seed, then
// `next start` on it. Run directly by Node (type stripping), so imports keep their extension and no TS only syntax.
import { PostgreSqlContainer } from "@testcontainers/postgresql";

import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = process.env.PORT ?? "3100";
const WEB_DIR = fileURLToPath(new URL("..", import.meta.url));
const DB_DIR = fileURLToPath(new URL("../../../packages/db", import.meta.url));
const ROLES_SQL = fileURLToPath(new URL("../../../infra/local/postgres/01-roles.sql", import.meta.url));

const container = await new PostgreSqlContainer("postgres:17-alpine")
  .withDatabase("espacios")
  .withUsername("espacios")
  .withPassword("espacios")
  .withCopyFilesToContainer([{ source: ROLES_SQL, target: "/docker-entrypoint-initdb.d/01-roles.sql" }])
  .start();

const adminUrl = container.getConnectionUri();
const loginUrl = (login: string) => adminUrl.replace("espacios:espacios@", `${login}:${login}@`);

try {
  const ownerEnv = { ...process.env, DATABASE_OWNER_URL: loginUrl("espacios_owner") };
  // The db package's own scripts, the same `pnpm db:deploy` and `pnpm db:seed` the README runs.
  for (const script of ["db:deploy", "db:seed"]) {
    execFileSync("pnpm", ["run", script], { cwd: DB_DIR, env: ownerEnv, stdio: "inherit" });
  }
} catch (error) {
  await container.stop();
  throw error;
}

const server = spawn("pnpm", ["exec", "next", "start", "--port", PORT], {
  cwd: WEB_DIR,
  env: {
    ...process.env,
    DATABASE_URL: loginUrl("espacios_app"),
    DATABASE_OPERATOR_URL: loginUrl("espacios_operator"),
  },
  stdio: "inherit",
});

let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  server.kill("SIGTERM");
  await container.stop();
  process.exit(code);
}

process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));
server.on("exit", (code) => void stop(code ?? 1));
