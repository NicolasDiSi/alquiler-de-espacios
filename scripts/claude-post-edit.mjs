#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook for Edit/Write/MultiEdit.
 * Fixes and checks only the edited file with Biome. Silent on success; on failure it prints the first
 * diagnostics to stderr and exits 2, which Claude Code feeds back to the agent.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SUPPORTED = /\.(?:[cm]?[jt]sx?|json|jsonc|css)$/;
const MAX_LINES = 15;

const payload = JSON.parse(readFileSync(0, "utf8"));
const filePath = payload?.tool_input?.file_path;
if (typeof filePath !== "string" || !SUPPORTED.test(filePath)) process.exit(0);

const cwd = payload.cwd ?? process.cwd();
const target = relative(cwd, filePath);
if (target.startsWith("..")) process.exit(0);

// Stay silent until the dependencies (and Biome) are installed.
if (!existsSync(join(cwd, "node_modules", ".bin", "biome"))) process.exit(0);

const result = spawnSync(
  "pnpm",
  ["exec", "biome", "check", "--write", "--no-errors-on-unmatched", "--diagnostic-level=error", target],
  { cwd, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } },
);

if (result.status === 0) process.exit(0);

const lines = `${result.stdout}${result.stderr}`.split("\n").filter((line) => line.trim() !== "");
process.stderr.write(`biome: ${target}\n${lines.slice(0, MAX_LINES).join("\n")}\n`);
process.exit(2);
