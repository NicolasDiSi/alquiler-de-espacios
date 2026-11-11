import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));

export type CliResult = { readonly status: number; readonly output: string };

/** Runs the project's Prisma CLI against a database as that login, like `pnpm db:seed` or `db:deploy` do. */
export function runPrisma(args: readonly string[], ownerUrl: string): CliResult {
  try {
    const output = execFileSync("pnpm", ["exec", "prisma", ...args], {
      cwd: PACKAGE_DIR,
      env: { ...process.env, DATABASE_OWNER_URL: ownerUrl },
      stdio: "pipe",
    });
    return { status: 0, output: output.toString() };
  } catch (error) {
    const failure = error as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout?.toString() ?? ""}${failure.stderr?.toString() ?? ""}`,
    };
  }
}
