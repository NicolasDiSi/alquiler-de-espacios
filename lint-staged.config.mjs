/**
 * Runs on staged files only. Output is kept compact so an agent iterating on hooks spends few tokens.
 * Tests run only for the files related to what is staged.
 */
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL(".", import.meta.url));

/**
 * Runs `vitest related` inside each touched workspace, the same way `turbo run test` and CI run tests, so the hook
 * and the gate exercise one execution context. Running from the repo root once hid a cwd bug in a test setup.
 */
function relatedTestsPerWorkspace(files) {
  const byWorkspace = new Map();
  for (const file of files) {
    const [area, name] = relative(REPO_ROOT, file).split("/");
    const workspace = `${area}/${name}`;
    byWorkspace.set(workspace, [...(byWorkspace.get(workspace) ?? []), file]);
  }
  return [...byWorkspace].map(
    ([workspace, workspaceFiles]) =>
      `pnpm --dir ${JSON.stringify(join(REPO_ROOT, workspace))} exec vitest related --run --passWithNoTests --reporter=dot ${workspaceFiles
        .map((file) => JSON.stringify(file))
        .join(" ")}`,
  );
}

export default {
  "*.{js,mjs,cjs,ts,tsx,json,jsonc,css}": "biome check --write --no-errors-on-unmatched --reporter=summary",
  "{apps,packages}/**/*.{ts,tsx}": relatedTestsPerWorkspace,
};
