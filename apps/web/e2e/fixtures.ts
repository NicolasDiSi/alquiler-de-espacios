import { type BrowserContext, expect, type Page } from "@playwright/test";

export const MODES = ["light", "dark"] as const;
export const DENSITIES = ["compact", "comfortable"] as const;
export type Mode = (typeof MODES)[number] | "system";
export type Density = (typeof DENSITIES)[number];
export type SidebarCollapsible = "icon" | "offcanvas";

/** Stores the preferences the way the app does (client cookies), before the page loads. */
export async function setPreferences(
  context: BrowserContext,
  preferences: { mode?: Mode; density?: Density; sidebarCollapsible?: SidebarCollapsible },
) {
  const cookies = [];
  if (preferences.mode) cookies.push({ name: "theme_mode", value: preferences.mode });
  if (preferences.density) cookies.push({ name: "density", value: preferences.density });
  if (preferences.sidebarCollapsible) {
    cookies.push({ name: "sidebar_collapsible", value: preferences.sidebarCollapsible });
  }
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://localhost:3100" })));
}

/**
 * Blocks the app's JavaScript bundles, so React never hydrates. Whatever the page shows then comes from the server
 * markup plus the inline boot script, which is what the browser paints first.
 */
export async function blockHydration(page: Page) {
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
}

/** Waits until the client has hydrated (the preferences store has synced from the DOM). */
export async function waitForHydration(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", /.+/);
  await page.waitForFunction(() => document.readyState === "complete");
  await page.waitForLoadState("networkidle");
}
