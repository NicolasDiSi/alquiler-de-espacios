import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { DENSITIES, MODES, setPreferences, waitForHydration } from "./fixtures";

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function expectNoViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(WCAG_22_AA);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, include ? `axe on ${include}` : "axe on the page").toEqual([]);
}

for (const mode of MODES) {
  for (const density of DENSITIES) {
    test.describe(`axe, ${mode} and ${density}`, () => {
      // Each axe run reads the whole page; hover and focus checks run one per button.
      test.describe.configure({ timeout: 120_000 });

      test.beforeEach(async ({ page, context }) => {
        await setPreferences(context, { mode, density });
        // Transitions finish at once, so axe reads each state's final colors.
        await page.emulateMedia({ reducedMotion: "reduce" });
      });

      test("the shell at / has no violations", async ({ page }) => {
        await page.goto("/");
        await waitForHydration(page);
        await expectNoViolations(page);
      });

      test("/design-system at rest, on hover and on keyboard focus", async ({ page }) => {
        await page.goto("/design-system");
        await waitForHydration(page);
        await expect(page.locator("html")).toHaveClass(mode === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
        await expectNoViolations(page);

        const buttons = page.locator("section[aria-labelledby=buttons] button:not([disabled])");
        const count = await buttons.count();
        for (let index = 0; index < count; index += 1) {
          await buttons.nth(index).hover();
          await expectNoViolations(page, "section[aria-labelledby=buttons] button:hover");
        }

        // Clicking the heading moves the keyboard starting point, then Tab focuses each control in turn.
        await page.getByRole("heading", { name: "Botones" }).click();
        for (let index = 0; index < count; index += 1) {
          await page.keyboard.press("Tab");
          await expectNoViolations(page, ":focus");
        }
      });

      test("/design-system with the dialog, the menu and a toast open", async ({ page }) => {
        await page.goto("/design-system");
        await waitForHydration(page);

        await page.getByRole("button", { name: "Reservar sala" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectNoViolations(page);
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: "Acciones" }).click();
        await expect(page.getByRole("menu")).toBeVisible();
        await expectNoViolations(page);
        await page.keyboard.press("Escape");

        for (const kind of ["Éxito", "Error", "Advertencia", "Información"]) {
          await page.getByRole("button", { name: kind, exact: true }).click();
        }
        await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
        await expectNoViolations(page);
      });
    });
  }
}
