import { expect, test } from "@playwright/test";

import { signSession } from "../src/lib/session/token";
import { BASE_URL, E2E_SESSION_SECRET, sessionCookie, sessionCookieState, USERS } from "./session";

const signedOut = { cookies: [], origins: [] };

test.describe("signed out", () => {
  test.use({ storageState: signedOut });

  test("a shell page sends you to the picker", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/ingresar$/);
    await expect(page.getByRole("heading", { level: 1, name: "¿Con qué usuario querés entrar?" })).toBeVisible();
  });

  test("the picker lists each company with its users, and the operator apart", async ({ page }) => {
    await page.goto("/ingresar");
    const acme = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Acme SA" }) });
    await expect(acme.getByRole("button", { name: `Entrar como ${USERS.ana.name}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Operador" })).toBeVisible();
    await expect(page.getByRole("button", { name: `Entrar como ${USERS.operador.name}` })).toBeVisible();
  });

  test("picking a member sets a signed, httpOnly cookie and lands on the member home", async ({ page, context }) => {
    await page.goto("/ingresar");
    await page.getByRole("button", { name: `Entrar como ${USERS.ana.name}` }).click();

    await expect(page).toHaveURL(`${BASE_URL}/`);
    await expect(page.getByRole("heading", { level: 1, name: "Mis reservas" })).toBeVisible();
    await expect(page.locator("main header").getByText(USERS.ana.company)).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === "espacios_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.secure).toBe(false);
    expect(cookie?.value).toMatch(new RegExp(`^${USERS.ana.id}\\.\\d+\\.[\\w-]+$`));
  });

  test("picking the operator lands on the operator home", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByRole("button", { name: `Entrar como ${USERS.operador.name}` }).click();
    await expect(page).toHaveURL(`${BASE_URL}/operador`);
    await expect(page.getByRole("heading", { level: 1, name: "Panel del operador" })).toBeVisible();
  });

  test("the API answers 401 with a reason and no data", async ({ request }) => {
    const response = await request.get("/api/v1/rooms");
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ code: "unauthenticated", message: expect.any(String) });
  });
});

test.describe("bad cookies are treated as signed out", () => {
  test.use({ storageState: signedOut });

  const cases = {
    tampered: () => {
      const { value } = sessionCookie(USERS.ana.id);
      return value.replace(USERS.ana.id, USERS.carla.id);
    },
    expired: () => sessionCookie(USERS.ana.id, new Date(Date.now() - 9 * 60 * 60 * 1000)).value,
    "signed with another key": () => signSession(USERS.ana.id, "x".repeat(40), new Date()),
    "unknown user": () => sessionCookie("user-that-does-not-exist").value,
  };

  for (const [name, value] of Object.entries(cases)) {
    test(`${name}: 401 from the API and the picker for pages`, async ({ page, context }) => {
      await context.addCookies([{ name: "espacios_session", value: value(), url: BASE_URL }]);

      const response = await page.request.get("/api/v1/rooms");
      expect(response.status()).toBe(401);
      expect((await response.json()).code).toBe("unauthenticated");

      await page.goto("/");
      await expect(page).toHaveURL(/\/ingresar$/);
    });
  }

  test("the e2e key is the one the server uses, so the cases above fail only on purpose", async ({ context }) => {
    await context.addCookies([sessionCookie(USERS.ana.id)]);
    const response = await context.request.get("/api/v1/rooms");
    expect(response.status()).toBe(200);
    expect(E2E_SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});

test.describe("signed in as a member", () => {
  test("the API lists the rooms", async ({ request }) => {
    const response = await request.get("/api/v1/rooms");
    expect(response.status()).toBe(200);
    const { rooms } = await response.json();
    expect(rooms).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "room-sol", name: "Sala Sol", capacity: 6 })]),
    );
  });

  test("an operator page gives 403", async ({ page }) => {
    const response = await page.goto("/operador");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { level: 1, name: "No tenés acceso a esta sección" })).toBeVisible();
    await page.getByRole("link", { name: "Ir a mi inicio" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mis reservas" })).toBeVisible();
  });

  test("switching user clears the cookie and returns to the picker", async ({ page, context }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Cambiar de usuario" }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
    expect((await context.cookies()).some((c) => c.name === "espacios_session")).toBe(false);

    await page.goto("/");
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});

test.describe("signed in as the operator", () => {
  test.use({ storageState: { cookies: [sessionCookieState(USERS.operador.id)], origins: [] } });

  test("a member page gives 403", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { level: 1, name: "No tenés acceso a esta sección" })).toBeVisible();
    await page.getByRole("link", { name: "Ir a mi inicio" }).click();
    await expect(page).toHaveURL(`${BASE_URL}/operador`);
  });
});
