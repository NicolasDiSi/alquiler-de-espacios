import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/testing/global-setup.ts"],
    hookTimeout: 120_000,
    testTimeout: 30_000,
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/generated/**", "src/testing/**"],
      thresholds: { lines: 70, branches: 70, functions: 70, statements: 70 },
    },
  },
});
