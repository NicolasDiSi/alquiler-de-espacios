/**
 * Architecture boundaries (ports and adapters). See docs/adr/0002-hexagonal-architecture.md.
 *
 * domain       -> nothing (pure business rules)
 * application  -> domain, zod (declares ports)
 * adapters     -> application, domain (implement ports)
 * apps         -> anything, but adapters are only wired in the composition root
 */
const ADAPTERS = "^packages/(db)/";
const COMPOSITION_ROOT = "^apps/[^/]+/src/composition(\\.ts|/)";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make layers impossible to reason about.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-is-pure",
      severity: "error",
      comment: "domain holds business rules only: no npm packages, no node built-ins, no other workspace packages.",
      from: { path: "^packages/domain/src" },
      to: {
        pathNot: "^packages/domain/src",
      },
    },
    {
      name: "application-has-no-infrastructure",
      severity: "error",
      comment: "application declares ports; it never imports adapters, frameworks or vendor SDKs.",
      from: { path: "^packages/application/src" },
      to: {
        pathNot: ["^packages/(application|domain)/src", "node_modules/zod/"],
      },
    },
    {
      name: "adapters-do-not-import-apps-or-each-other",
      severity: "error",
      comment: "An adapter implements a port. It must not reach into an app or into another adapter.",
      from: { path: ADAPTERS },
      to: {
        path: ["^apps/", ADAPTERS],
        pathNot: "^packages/$1/",
      },
    },
    {
      name: "packages-do-not-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "only-composition-root-wires-adapters",
      severity: "error",
      comment: "Apps call use cases. Adapters are instantiated only in apps/<app>/src/composition.",
      from: { path: "^apps/", pathNot: COMPOSITION_ROOT },
      to: { path: ADAPTERS },
    },
    {
      name: "prisma-only-in-db",
      severity: "error",
      comment: "Only packages/db talks to Prisma. Everyone else goes through repository ports.",
      from: { pathNot: "^packages/db/" },
      to: { path: "node_modules/(@prisma|prisma)/" },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$",
          "[.]d[.]ts$",
          "(^|/)tsconfig[.]json$",
          "(^|/)(?:babel|webpack|vite|vitest|next|playwright|postcss|tailwind)[.]config[.](?:js|cjs|mjs|ts|cts|mts)$",
          "^apps/web/src/app/",
          "^apps/web/src/i18n/request[.]ts$",
          "^apps/web/e2e/",
          "[.]test[.]tsx?$",
        ],
      },
      to: {},
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: ["node_modules"] },
    exclude: {
      path: ["(^|/)(dist|coverage|\\.next|generated|playwright-report|test-results)/", "(^|/)next-env[.]d[.]ts$"],
    },
    tsPreCompilationDeps: true,
    // Resolves the "@/" alias of apps/web. Packages declare no paths, so it changes nothing for them.
    tsConfig: { fileName: "tsconfig.depcruise.json" },
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
