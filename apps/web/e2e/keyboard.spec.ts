import { expect, type Page, test } from "@playwright/test";

import { DENSITIES, setPreferences, waitForHydration } from "./fixtures";

type Stop = {
  name: string;
  width: number;
  height: number;
  hasIndicator: boolean;
  obscured: boolean;
  key: string;
};

/** Describes the focused element: its hit area (including an absolute ::after), focus indicator and position. */
function describeFocus(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return null;

    const rect = element.getBoundingClientRect();
    const after = getComputedStyle(element, "::after");
    let { width, height } = rect;
    if (after.position === "absolute" && after.content !== "none") {
      const grow = (value: string) => Math.max(0, -Number.parseFloat(value) || 0);
      width += grow(after.left) + grow(after.right);
      height += grow(after.top) + grow(after.bottom);
    }

    const style = getComputedStyle(element);
    const hasOutline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
    const hasIndicator = hasOutline || style.boxShadow !== "none";

    const header = document.querySelector("main header");
    const inChrome = Boolean(element.closest("header, [data-slot=sidebar]"));
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    // Under the header's bottom edge is only a problem when something else is painted on top of the element.
    const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const onTop = topmost !== null && (topmost === element || element.contains(topmost));
    const obscured = !inChrome && rect.top < headerBottom - 1 && !onTop;

    const name = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName;
    const key = `${element.tagName}:${element.id}:${name}:${Math.round(rect.left)}:${Math.round(rect.top + window.scrollY)}`;
    return { name, width, height, hasIndicator, obscured, key };
  });
}

async function walk(page: Page): Promise<Stop[]> {
  const stops: Stop[] = [];
  const seen = new Set<string>();
  for (let press = 0; press < 200; press += 1) {
    await page.keyboard.press("Tab");
    const stop = await describeFocus(page);
    if (!stop) continue;
    if (seen.has(stop.key)) break;
    seen.add(stop.key);
    stops.push(stop);
  }
  return stops;
}

for (const density of DENSITIES) {
  for (const path of ["/", "/design-system"]) {
    test(`every control on ${path} is reachable, visible when focused and at least 24px (${density})`, async ({
      page,
      context,
    }) => {
      await setPreferences(context, { density });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      await waitForHydration(page);

      const stops = await walk(page);
      expect(stops.length).toBeGreaterThan(path === "/" ? 4 : 30);
      expect(stops.filter((stop) => !stop.hasIndicator).map((stop) => stop.name)).toEqual([]);
      expect(stops.filter((stop) => stop.obscured).map((stop) => stop.name)).toEqual([]);
      expect(
        stops.filter((stop) => stop.width < 24 || stop.height < 24).map((s) => `${s.name} ${s.width}x${s.height}`),
      ).toEqual([]);
    });
  }
}

test("the skip link moves focus to the content", async ({ page }) => {
  await page.goto("/");
  await waitForHydration(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("the dialog opens, traps focus and returns it with the keyboard alone", async ({ page }) => {
  await page.goto("/design-system");
  await waitForHydration(page);
  const trigger = page.getByRole("button", { name: "Reservar sala" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the density switch works with arrow keys and Space", async ({ page }) => {
  await page.goto("/");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Preferencias de diseño" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("radio", { name: "Compacta" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Cómoda" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
});

test("focus stays visible in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/design-system");
  await waitForHydration(page);
  await page.getByRole("heading", { name: "Botones" }).click();
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).toBe("solid");
});

test("motion is cut when the reader prefers reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/design-system");
  const duration = await page
    .getByRole("button", { name: "Reservar sala" })
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(duration).toBeLessThan(0.01);
});
