import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { waitForHydration } from "./fixtures";
import { sessionCookieState, USERS } from "./session";

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** A name that is new on every run, so a reused server and database never collide. */
const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

const dialog = (page: Page) => page.getByRole("dialog");

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** A day 30 days ahead as the operator types it (`dd/mm/aaaa`): in the future for the block rule. */
function inThirtyDays(): string {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10).split("-").reverse().join("/");
}

test.describe("operator administration screens (spec 0005)", () => {
  test.use({ storageState: { cookies: [sessionCookieState(USERS.operador.id)], origins: [] } });

  test("the sidebar leads home and to each section, and marks where you are", async ({ page }) => {
    await page.goto("/operador/sedes");
    await waitForHydration(page);
    const sidebar = page.locator("[data-slot=sidebar]");
    await expect(sidebar.getByRole("link", { name: "Sedes" })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Panel" })).not.toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Mis reservas" })).toHaveCount(0);

    await sidebar.getByRole("link", { name: "Panel" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Panel del operador" })).toBeVisible();
    await sidebar.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Clientes" })).toBeVisible();
    // The product name leads to the operator's home, never to the member's (403 for the operator).
    await sidebar.getByRole("link", { name: "alquiler-de-espacios, ir al inicio" }).click();
    await expect(page).toHaveURL(/\/operador$/);
  });

  test("the sede list searches, filters by state with counts, and clears", async ({ page }) => {
    await page.goto("/operador/sedes");
    await waitForHydration(page);
    await page.getByRole("searchbox", { name: "Buscar por nombre o dirección" }).fill("central");
    await expect(page.getByRole("row", { name: /Sede Central/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Búsqueda: central Quitar" })).toBeVisible();

    await page.getByRole("searchbox", { name: "Buscar por nombre o dirección" }).fill("no existe ninguna");
    await expect(page.getByText("No hay resultados con estos filtros")).toBeVisible();
    await page.getByRole("button", { name: "Limpiar filtros" }).first().click();
    // Clearing goes back to every sede, retired ones included: the state filter is cleared too.
    await expect(page.getByRole("row", { name: /Sede Central/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Estado: / })).toHaveCount(0);
  });

  test("a column sorts both ways and says so", async ({ page }) => {
    await page.goto("/operador/sedes");
    await waitForHydration(page);
    const header = page.getByRole("columnheader", { name: /Nombre/ });
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
  });

  test("creates a sede, adds a room, blocks it and releases the block", async ({ page }) => {
    const sede = unique("Sede E2E");
    const sala = unique("Sala E2E");
    await page.goto("/operador/sedes");
    await waitForHydration(page);

    await page.getByRole("button", { name: "Nueva sede" }).first().click();
    await dialog(page).getByLabel("Nombre").fill(sede);
    await dialog(page).getByRole("button", { name: "Crear sede" }).click();
    await expect(page.getByText("Sede creada")).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar por nombre o dirección" }).fill(sede);
    await page.getByRole("link", { name: sede }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: sede })).toBeVisible();

    // Rooms and blocks are tabs of the sede page, after its activity.
    await page.getByRole("tab", { name: /Salas/ }).click();
    await page.getByRole("button", { name: "Nueva sala" }).click();
    await dialog(page).getByLabel("Nombre").fill(sala);
    await dialog(page).getByLabel("Capacidad (personas)").fill("6");
    await dialog(page).getByRole("button", { name: "Crear sala" }).click();
    await expect(page.getByText("Sala creada")).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(sala) })).toBeVisible();

    await page.getByRole("tab", { name: /Bloqueos/ }).click();
    await page.getByRole("button", { name: "Nuevo bloqueo" }).click();
    await dialog(page).getByLabel("Alcance").selectOption({ label: sala });
    await dialog(page).getByLabel("Desde (día)").fill(inThirtyDays());
    await dialog(page).getByRole("button", { name: "Todo el día" }).click();
    await dialog(page).getByLabel("Motivo").fill("Mantenimiento E2E");
    await dialog(page).getByRole("button", { name: "Crear bloqueo" }).click();
    await expect(page.getByText("Bloqueo creado")).toBeVisible();
    const block = page.getByRole("row", { name: /Mantenimiento E2E/ });
    await expect(block.getByText("Activo")).toBeVisible();

    await block.getByRole("button", { name: "Liberar" }).click();
    await dialog(page).getByRole("button", { name: "Liberar" }).click();
    await expect(page.getByText("Bloqueo liberado")).toBeVisible();
    // Active blocks are the default view; a released one is reached through the state filter.
    await expect(page.getByRole("row", { name: /Mantenimiento E2E/ })).toHaveCount(0);
    await page
      .getByRole("button", { name: /^Estado/ })
      .last()
      .click();
    await page.getByRole("checkbox", { name: "Liberado" }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("row", { name: /Mantenimiento E2E/ }).getByText("Liberado")).toBeVisible();
  });

  test("a duplicate sede name says why under the field, which keeps the focus and the value", async ({ page }) => {
    const sede = unique("Sede duplicada");
    await page.goto("/operador/sedes");
    await waitForHydration(page);
    for (const expectation of ["Sede creada", "Ya existe un registro con ese nombre o código"]) {
      await page.getByRole("button", { name: "Nueva sede" }).first().click();
      await dialog(page).getByLabel("Nombre").fill(sede);
      await dialog(page).getByRole("button", { name: "Crear sede" }).click();
      await expect(page.getByText(expectation)).toBeVisible();
    }
    const name = dialog(page).getByLabel("Nombre");
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAccessibleDescription(/Ya existe un registro con ese nombre o código/);
    await expect(name).toHaveValue(sede);
  });

  test("a sede cannot be deactivated while it has active rooms, and the dialog says so", async ({ page }) => {
    await page.goto("/operador/sedes");
    await waitForHydration(page);
    await page.getByRole("link", { name: "Sede Central" }).first().click();
    await page.getByRole("button", { name: "Desactivar sede" }).click();
    await dialog(page).getByRole("button", { name: "Desactivar sede" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("salas activas");
  });

  test("a person who works alone has one member; a company can add more", async ({ page }) => {
    const persona = unique("Persona E2E");
    const empresa = unique("Empresa E2E");
    await page.goto("/operador/clientes");
    await waitForHydration(page);

    await page.getByRole("button", { name: "Nuevo cliente" }).first().click();
    await dialog(page).getByLabel("Persona independiente").click();
    await expect(dialog(page).getByLabel("Primer miembro")).toHaveCount(0);
    await dialog(page).getByLabel("Nombre").fill(persona);
    await dialog(page).getByRole("button", { name: "Crear cliente" }).click();
    await expect(page.getByText("Cliente creado")).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar por nombre o código" }).fill(persona);
    await page.getByRole("link", { name: persona }).first().click();
    // Members live in their own tab of the client page (spec 0007).
    await page.getByRole("tab", { name: /Miembros/ }).click();
    await expect(page.getByRole("row", { name: new RegExp(persona) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar miembro" })).toHaveCount(0);

    await page.goto("/operador/clientes");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Nuevo cliente" }).first().click();
    await dialog(page).getByLabel("Nombre").fill(empresa);
    await dialog(page).getByLabel("Primer miembro").fill("Marta");
    await dialog(page).getByRole("button", { name: "Crear cliente" }).click();
    await expect(page.getByText("Cliente creado")).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar por nombre o código" }).fill(empresa);
    await page.getByRole("link", { name: empresa }).first().click();
    await page.getByRole("tab", { name: /Miembros/ }).click();
    await page.getByRole("button", { name: "Agregar miembro" }).click();
    await dialog(page).getByLabel("Nombre").fill("Luis");
    await dialog(page).getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("Miembro agregado")).toBeVisible();
    await expect(page.getByRole("row", { name: /Luis/ })).toBeVisible();
  });

  test("an unknown sede is a 404 page", async ({ page }) => {
    const response = await page.goto("/operador/sedes/no-existe");
    expect(response?.status()).toBe(404);
  });

  test("the four pages and a dialog have no axe violations", async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/operador/sedes");
    await waitForHydration(page);
    await expectNoViolations(page);
    await page.getByRole("button", { name: "Nueva sede" }).first().click();
    await expectNoViolations(page);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);

    await page.getByRole("link", { name: "Sede Central" }).first().click();
    await expectNoViolations(page);
    await page.getByRole("tab", { name: /Bloqueos/ }).click();
    await page.getByRole("button", { name: "Nuevo bloqueo" }).click();
    await expectNoViolations(page);
    await page.keyboard.press("Escape");

    await page.goto("/operador/clientes");
    await waitForHydration(page);
    await expectNoViolations(page);
    await page.getByRole("link").filter({ hasText: /Acme/ }).first().click();
    await expectNoViolations(page);
  });
});

test.describe("who may open the screens", () => {
  test("a member gets 403 on each page", async ({ page }) => {
    for (const path of ["/operador/sedes", "/operador/clientes"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(403);
    }
  });

  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("the pages send you to the picker", async ({ page }) => {
      await page.goto("/operador/sedes");
      await expect(page).toHaveURL(/\/ingresar$/);
    });
  });
});
