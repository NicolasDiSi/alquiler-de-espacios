import { expect, test } from "@playwright/test";

import { blockHydration, setPreferences, waitForHydration } from "./fixtures";

test.describe("shell", () => {
  test("renders the shell at / with the member's sections and bookings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Mis reservas" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Nueva reserva" }).first()).toBeVisible();

    const sidebar = page.locator("[data-slot=sidebar]");
    await expect(sidebar.getByText("alquiler-de-espacios")).toBeVisible();
    // The product link and the member's sections (spec 0005): never an operator entry nor the gallery.
    await expect(sidebar.getByRole("link")).toHaveCount(3);
    await expect(sidebar.getByRole("link", { name: "Mis reservas" })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Nueva reserva" })).toBeVisible();
    await expect(sidebar.locator('a[href^="/operador"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href="/design-system"]')).toHaveCount(0);

    const header = page.locator("main header");
    await expect(header.getByRole("button", { name: "Buscar" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Preferencias de diseño" })).toBeVisible();
    await expect(header.getByRole("button", { name: /^Modo: / })).toBeVisible();
    await expect(header.getByRole("button", { name: /^Cuenta de / })).toBeVisible();
  });

  test("the sidebar toggle lives in the header and reopens a hidden sidebar", async ({ page, context }) => {
    await setPreferences(context, { sidebarCollapsible: "offcanvas" });
    await page.goto("/");
    await waitForHydration(page);

    const toggle = page.locator("main header").getByRole("button", { name: "Mostrar u ocultar el menú lateral" });
    await expect(page.getByRole("button", { name: "Mostrar u ocultar el menú lateral" })).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Offcanvas hides the whole sidebar, so the header toggle is the way back.
    const sidebar = page.locator("[data-slot=sidebar][data-state]");
    await toggle.click();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("/design-system is reachable by URL and excluded from indexing", async ({ page }) => {
    await page.goto("/design-system");
    await expect(page.getByRole("heading", { level: 1, name: "Sistema de diseño" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("one default theme, the system font at 14px and no web font", async ({ page }) => {
    const fontRequests: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "font") fontRequests.push(request.url());
    });
    await page.goto("/");
    await waitForHydration(page);

    await expect(page.locator("html")).not.toHaveAttribute("data-theme-preset", /.*/);
    await expect(page.locator("html")).not.toHaveAttribute("data-font", /.*/);
    const body = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return { size: style.fontSize, family: style.fontFamily };
    });
    expect(body.size).toBe("14px");
    expect(body.family.startsWith("-apple-system")).toBe(true);
    expect(fontRequests).toEqual([]);
  });

  test("texts are Spanish, with es-AR formats in the Buenos Aires time zone", async ({ page }) => {
    await page.goto("/design-system");
    await expect(page.locator("html")).toHaveAttribute("lang", "es-AR");
    const firstRow = page.getByRole("row").filter({ hasText: "RES-104" });
    // 13:05 UTC is 10:05 in Buenos Aires; es-AR writes day/month/year, and the app's formats use a 24 hour clock.
    await expect(firstRow).toContainText("03/11/2026, 10:05");
    await expect(page.getByRole("row").filter({ hasText: "RES-103" })).toContainText("1.250,00");

    await waitForHydration(page);
    await page.getByRole("button", { name: "Reservar sala" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cerrar" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(0);
  });
});

test.describe("preferences before the first paint", () => {
  test("a stored dark mode and comfortable density apply without React", async ({ page, context }) => {
    await setPreferences(context, { mode: "dark", density: "comfortable" });
    await blockHydration(page);
    await page.goto("/design-system");

    const html = page.locator("html");
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute("data-density", "comfortable");
    expect(await html.evaluate((element) => element.style.colorScheme)).toBe("dark");
  });

  test("system mode on a dark operating system applies dark without React", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await blockHydration(page);
    await page.goto("/");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme-mode", "system");
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute("data-density", "compact");
  });

  test("system mode follows the operating system while the page is open", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await waitForHydration(page);
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/\bdark\b/);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).not.toHaveClass(/\bdark\b/);
  });

  test("density changes control and row heights only", async ({ page, context }) => {
    const measure = async () => {
      await page.goto("/design-system");
      const button = page.getByRole("button", { name: "Reservar sala" });
      const header = page.getByRole("columnheader", { name: "Código" });
      const small = page.getByRole("button", { name: "Pequeño" });
      return {
        button: (await button.boundingBox())?.height,
        small: (await small.boundingBox())?.height,
        header: (await header.boundingBox())?.height,
        text: await page.evaluate(() => getComputedStyle(document.body).fontSize),
      };
    };

    expect(await measure()).toEqual({ button: 32, small: 28, header: 40, text: "14px" });
    await setPreferences(context, { density: "comfortable" });
    expect(await measure()).toEqual({ button: 40, small: 35, header: 50, text: "14px" });
  });

  test("the density switch in the preferences changes the density and stores it", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Preferencias de diseño" }).click();
    await page.getByRole("radiogroup", { name: "Densidad" }).getByRole("radio", { name: "Cómoda" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
  });
});
