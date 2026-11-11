import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const CI = Boolean(process.env.CI);

// Runs against `next start`, so the build that ships is the build that is tested (turbo builds first).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // One `next start` serves every worker; more workers than this starve it.
  workers: 2,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["dot"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
