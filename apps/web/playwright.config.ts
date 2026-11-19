import { defineConfig, devices } from "@playwright/test";

import { E2E_SESSION_SECRET, sessionCookieState, USERS } from "./e2e/session";

const PORT = 3100;
const CI = Boolean(process.env.CI);

// Runs against `next start`, so the build that ships is the build that is tested (turbo builds first). The server
// runs on its own throwaway, seeded Postgres (e2e/web-server.ts), so Docker must be running.
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
    // Every page of the shell needs a session, so tests start signed in as a seeded member. Identity tests clear it.
    storageState: { cookies: [sessionCookieState(USERS.ana.id)], origins: [] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node e2e/web-server.ts`,
    url: `http://localhost:${PORT}/ingresar`,
    reuseExistingServer: !CI,
    // Pulling the Postgres image, migrating and seeding come before `next start`.
    timeout: 180_000,
    env: { NEXT_TELEMETRY_DISABLED: "1", PORT: String(PORT), SESSION_SECRET: E2E_SESSION_SECRET },
  },
});
