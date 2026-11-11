#!/usr/bin/env node
/**
 * Runs every quality gate and prints one PASS/FAIL line per gate, plus the first lines of each failure.
 * Built for agents: no colors, no progress bars, bounded output. Exit code is non-zero if any gate fails.
 *
 * Usage:
 *   pnpm check:ai                  all gates, whole repo
 *   pnpm check:ai --affected       only workspaces changed against the base branch (pre-push uses this)
 *   pnpm check:ai --gate=test      a single gate (biome, strings, typecheck, boundaries, knip, test, e2e)
 *   pnpm check:ai --lines=40       more failure lines per gate (default 20)
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);

const maxLines = Number(args.get("lines") ?? 20);
const onlyGate = args.get("gate");
const affected = args.has("affected");

const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: "1", TURBO_NO_UPDATE_NOTIFIER: "1" };

function run(command, commandArgs) {
  return spawnSync(command, commandArgs, { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
}

function findBaseRef() {
  for (const ref of ["origin/develop", "develop", "origin/main", "main"]) {
    const result = run("git", ["rev-parse", "--verify", "--quiet", ref]);
    if (result.status === 0) return ref;
  }
  return null;
}

const baseRef = affected ? findBaseRef() : null;
const turboFilter = baseRef ? [`--filter=...[${baseRef}]`] : [];
const biomeScope = baseRef ? ["--changed", `--since=${baseRef}`, "--no-errors-on-unmatched"] : [];

const gates = [
  { name: "biome", command: "pnpm", args: ["exec", "biome", "check", "--reporter=summary", ...biomeScope] },
  { name: "strings", command: "node", args: [fileURLToPath(new URL("./check-strings.mjs", import.meta.url))] },
  {
    name: "typecheck",
    command: "pnpm",
    args: ["exec", "turbo", "run", "typecheck", "--output-logs=errors-only", ...turboFilter],
  },
  { name: "boundaries", command: "pnpm", args: ["run", "--silent", "depcruise"] },
  { name: "knip", command: "pnpm", args: ["exec", "knip", "--reporter", "compact", "--no-progress"] },
  {
    name: "test",
    command: "pnpm",
    args: ["exec", "turbo", "run", "test", "--output-logs=errors-only", ...turboFilter],
  },
  {
    // Builds and runs the Playwright suites (apps/web). With --affected it runs only when a suite's workspace changed.
    name: "e2e",
    command: "pnpm",
    args: ["exec", "turbo", "run", "e2e", "--output-logs=errors-only", ...turboFilter],
  },
];

const selected = onlyGate ? gates.filter((gate) => gate.name === onlyGate) : gates;
if (selected.length === 0) {
  console.log(`Unknown gate "${onlyGate}". Gates: ${gates.map((gate) => gate.name).join(", ")}`);
  process.exit(2);
}

if (affected) console.log(baseRef ? `scope: affected since ${baseRef}` : "scope: whole repo (no base branch found)");

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences on purpose
const ansi = /\u001b\[[0-9;]*m/g;
let failed = 0;

for (const gate of selected) {
  const started = performance.now();
  const result = run(gate.command, gate.args);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  if (result.status === 0) {
    console.log(`PASS ${gate.name} (${seconds}s)`);
    continue;
  }

  failed += 1;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(ansi, "");
  const lines = output.split("\n").filter((line) => line.trim() !== "");
  console.log(`FAIL ${gate.name} (${seconds}s)`);
  for (const line of lines.slice(0, maxLines)) console.log(`  ${line}`);
  if (lines.length > maxLines) {
    console.log(`  … ${lines.length - maxLines} more lines (pnpm check:ai --gate=${gate.name} --lines=200)`);
  }
}

process.exit(failed === 0 ? 0 : 1);
