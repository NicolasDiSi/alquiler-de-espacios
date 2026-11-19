import { describe, expect, it } from "vitest";

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The rules every `/api/v1` Route Handler follows (docs/api/company.md and operator.md), checked on the source so a
 * new route that skips one fails here, before any request reaches it. What the handlers answer is in handlers.test.ts.
 */
const API_DIR = fileURLToPath(new URL(".", import.meta.url));
const OPERATOR_DOC = readFileSync(
  fileURLToPath(new URL("../../../../../../docs/api/operator.md", import.meta.url)),
  "utf8",
);
const COMPANY_DOC = readFileSync(
  fileURLToPath(new URL("../../../../../../docs/api/company.md", import.meta.url)),
  "utf8",
);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type Route = { readonly path: string; readonly source: string; readonly methods: readonly string[] };

const routes: Route[] = readdirSync(API_DIR, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith("route.ts"))
  .map((file) => {
    const source = readFileSync(`${API_DIR}/${file}`, "utf8");
    const path = `/${file.replace(/\\/g, "/").replace(/\/?route\.ts$/, "")}`.replace(/\[(\w+)\]/g, "{$1}");
    const methods = METHODS.filter((method) => new RegExp(`export (async )?function ${method}\\b`).test(source));
    return { path, source, methods };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const isOperator = (route: Route) => route.path.startsWith("/operator/");
const count = (source: string, pattern: RegExp) => source.match(pattern)?.length ?? 0;

/** A doc line for `METHOD /path`: it names the method with the first segment and mentions every later one. */
function documented(doc: string, method: string, path: string): boolean {
  const [first, ...rest] = path.split("/").filter(Boolean);
  return doc
    .split("\n")
    .some((line) => line.includes(`\`${method} /${first}`) && rest.every((segment) => line.includes(segment)));
}

describe("the /api/v1 route files", () => {
  it("are found, each with at least one handler", () => {
    expect(routes.length).toBeGreaterThanOrEqual(24);
    for (const route of routes) expect(route.methods, route.path).not.toHaveLength(0);
  });

  it("run every operator handler inside operatorRoute, which authenticates the operator first", () => {
    for (const route of routes.filter(isOperator)) {
      expect(count(route.source, /operatorRoute\(request,/g), route.path).toBe(route.methods.length);
      expect(route.source, route.path).not.toMatch(/authenticateRequest\(/);
    }
  });

  it("authenticate every company handler first, on the member edge unless it is a shared read", () => {
    for (const route of routes.filter((route) => !isOperator(route))) {
      const guards = route.source.match(/authenticateRequest\(request, "(\w+)"\)/g) ?? [];
      expect(guards, route.path).toHaveLength(route.methods.length);
      // Only the room list is shared with the operator; everything else is the member's.
      const expected = route.path === "/rooms" ? "any" : "member";
      for (const guard of guards) expect(guard, route.path).toContain(`"${expected}"`);
    }
  });

  it("never read a company or tenant id on the company edge: the session says which company it is", () => {
    for (const route of routes.filter((route) => !isOperator(route))) {
      expect(route.source, route.path).not.toMatch(/companyId|tenantId/);
    }
  });

  it("never answer with a raw error: failures go through the typed reasons", () => {
    for (const route of routes) {
      expect(route.source, route.path).not.toMatch(/\.message\b|String\(error\)|catch \(error\)/);
    }
  });

  it("are each documented, in operator.md or company.md", () => {
    for (const route of routes) {
      const doc = isOperator(route) ? OPERATOR_DOC : COMPANY_DOC;
      const path = isOperator(route) ? route.path.slice("/operator".length) : route.path;
      for (const method of route.methods) expect(documented(doc, method, path), `${method} ${route.path}`).toBe(true);
    }
  });
});
