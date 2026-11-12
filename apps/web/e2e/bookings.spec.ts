import { addDays, isOpenWeekday, type LocalDate, localDateOf } from "@espacios/domain";
import { expect, type Page, test } from "@playwright/test";

import { CENTRAL, START_TIMES } from "./facility";
import { waitForHydration } from "./fixtures";
import { sessionCookie, USERS } from "./session";

/**
 * A weekday 30 to 58 days ahead and a start between 08:00 and 19:00, picked at random: the seed only fills the
 * previous and next weeks, and parallel tests must not take each other's slot.
 */
function freeSlot(): { date: LocalDate; start: string; end: string } {
  let date = addDays(localDateOf(new Date(), CENTRAL.timeZone), 30 + Math.floor(Math.random() * 25));
  while (!isOpenWeekday(date, CENTRAL)) date = addDays(date, 1);
  const index = Math.floor(Math.random() * (START_TIMES.length - 2));
  return { date, start: START_TIMES[index] ?? "08:00", end: START_TIMES[index + 1] ?? "08:30" };
}

/** `2026-12-21` as the list shows it and the form takes it typed, `21/12/2026`. */
const shown = (date: LocalDate) => date.split("-").reverse().join("/");

/** The room option as the form lists it. Tests that run in parallel book different rooms. */
const ROOMS = { mar: "Sala Mar · 16 personas", luna: "Sala Luna · 10 personas" } as const;

async function book(page: Page, slot: ReturnType<typeof freeSlot>, room: string = ROOMS.mar) {
  await page.goto("/reservas/nueva");
  await waitForHydration(page);
  await page.getByLabel("Sala", { exact: true }).selectOption({ label: room });
  await page.getByLabel("Fecha", { exact: true }).fill(shown(slot.date));
  await page.getByLabel("Inicio", { exact: true }).selectOption(slot.start);
  await page.getByLabel("Fin", { exact: true }).selectOption(slot.end);
  await page.getByRole("button", { name: "Reservar" }).click();
}

test.describe("book a room (spec 0003)", () => {
  test("a member books a room and sees it in Mis reservas", async ({ page }) => {
    const slot = freeSlot();
    await book(page, slot);

    await expect(page).toHaveURL(/\/\?vista=proximas&nueva=/);
    const row = page
      .getByRole("row")
      .filter({ hasText: "Sala Mar" })
      .filter({ hasText: shown(slot.date) })
      .filter({ hasText: `${slot.start} a ${slot.end}` });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(USERS.ana.name);
    await expect(row).toContainText("Confirmada");
  });

  test("another company booking the same slot is told the room is taken, and keeps its values", async ({
    page,
    context,
  }) => {
    const slot = freeSlot();
    await book(page, slot, ROOMS.luna);
    await expect(page).toHaveURL(/nueva=/);

    await context.clearCookies();
    await context.addCookies([sessionCookie(USERS.carla.id)]);
    await book(page, slot, ROOMS.luna);

    const alert = page.getByRole("alert").filter({ hasText: "La sala ya está reservada en ese horario" });
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
    await expect(page).toHaveURL(/\/reservas\/nueva$/);
    await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue(slot.start);
    await expect(page.getByLabel("Inicio", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Fin", { exact: true })).toHaveValue(slot.end);
    await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue(shown(slot.date));
    // Nothing about the other booking: no company, no user.
    await expect(alert).not.toContainText(USERS.ana.company);
    await expect(alert).not.toContainText(USERS.ana.name);
  });

  test("a member cancels a booking, it moves to Canceladas, and another company can take the slot", async ({
    page,
    context,
  }) => {
    const slot = freeSlot();
    await book(page, slot, ROOMS.luna);
    await expect(page).toHaveURL(/nueva=/);

    const row = page
      .getByRole("row")
      .filter({ hasText: "Sala Luna" })
      .filter({ hasText: shown(slot.date) })
      .filter({ hasText: `${slot.start} a ${slot.end}` });
    await row.getByRole("button", { name: /^Cancelar la reserva de Sala Luna/ }).click();
    const dialog = page.getByRole("dialog", { name: "¿Cancelar esta reserva?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Sí, cancelar reserva" }).click();

    await expect(page.getByText("Reserva cancelada").first()).toBeVisible();
    await expect(row).toHaveCount(0);

    await page
      .getByRole("navigation", { name: "Vistas de reservas" })
      .getByRole("link", { name: "Canceladas" })
      .click();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "Sala Luna" })
        .filter({ hasText: shown(slot.date) })
        .filter({ hasText: "Cancelada" }),
    ).toHaveCount(1);

    await context.clearCookies();
    await context.addCookies([sessionCookie(USERS.carla.id)]);
    await book(page, slot, ROOMS.luna);
    await expect(page).toHaveURL(/nueva=/);
  });

  test("the operator gets 403 on both pages and the API", async ({ page, context }) => {
    await context.clearCookies();
    await context.addCookies([sessionCookie(USERS.operador.id)]);

    for (const path of ["/", "/reservas/nueva"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "No tenés acceso a esta sección" })).toBeVisible();
    }
    const api = await page.request.get("/api/v1/bookings");
    expect(api.status()).toBe(403);
  });

  test("signed out, the pages go to the picker and the API answers 401", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/reservas/nueva");
    await expect(page).toHaveURL(/\/ingresar$/);
    const api = await page.request.get("/api/v1/bookings");
    expect(api.status()).toBe(401);
    await expect(api.json()).resolves.toMatchObject({ code: "unauthenticated" });
  });

  test("a prefill link fills the form, and values the form would not offer fall back", async ({ page }) => {
    const slot = freeSlot();
    await page.goto(`/reservas/nueva?sala=room-mar&fecha=${slot.date}&inicio=${slot.start}&fin=${slot.end}`);
    await expect(page.getByLabel("Sala", { exact: true })).toHaveValue("room-mar");
    await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue(shown(slot.date));
    await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue(slot.start);
    await expect(page.getByLabel("Fin", { exact: true })).toHaveValue(slot.end);

    await page.goto(`/reservas/nueva?sala=room-nope&fecha=${slot.date}&inicio=10:15&fin=${slot.end}`);
    await expect(page.getByLabel("Sala", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue(shown(slot.date));
    await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Fin", { exact: true })).toHaveValue("");
  });

  test("a date is picked with the keyboard only, and focus returns to the calendar button", async ({ page }) => {
    await page.goto("/reservas/nueva");
    await waitForHydration(page);
    const initial = (await page.locator('input[name="date"]').inputValue()) as LocalDate;

    const trigger = page.getByRole("button", { name: /^Cambiar fecha/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("grid")).toBeVisible();
    // One week later is the same weekday, so it is always bookable.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    const picked = addDays(initial, 7);
    await expect(page.getByRole("grid")).toBeHidden();
    await expect(page.getByLabel("Fecha", { exact: true })).toHaveValue(shown(picked));
    await expect(page.locator('input[name="date"]')).toHaveValue(picked);
    await expect(trigger).toBeFocused();
  });

  test("the calendar disables weekends and says why", async ({ page }) => {
    await page.goto("/reservas/nueva");
    await page.getByRole("button", { name: /^Cambiar fecha/ }).click();
    const grid = page.getByRole("grid");
    // Every week of the shown month has a Saturday and a Sunday, so there are always disabled days in it.
    await expect(grid.locator("td[data-disabled=true]:not([data-outside]) button").first()).toBeDisabled();
    await expect(page.getByText("Se reserva de lunes a viernes, hasta 60 días adelante.")).toBeVisible();
  });

  test("a date typed in a way that cannot be read is refused with Fecha marked", async ({ page }) => {
    const slot = freeSlot();
    await page.goto(`/reservas/nueva?sala=room-mar&inicio=${slot.start}`);
    await waitForHydration(page);
    await page.getByLabel("Fecha", { exact: true }).fill("31/02/2030");
    await page.getByRole("button", { name: "Reservar" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "La solicitud no tiene el formato esperado" }),
    ).toBeVisible();
    await expect(page.getByLabel("Fecha", { exact: true })).toHaveAttribute("aria-invalid", "true");
  });

  test("a session that expired while the form was open offers a way back to the picker", async ({ page, context }) => {
    const slot = freeSlot();
    await page.goto(`/reservas/nueva?sala=room-mar&fecha=${slot.date}&inicio=${slot.start}&fin=${slot.end}`);
    await waitForHydration(page);
    await context.clearCookies();
    await page.getByRole("button", { name: "Reservar" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "Tu sesión no es válida o venció" });
    await expect(alert).toBeFocused();
    await expect(alert.getByRole("link", { name: "Elegir usuario de nuevo" })).toHaveAttribute("href", "/ingresar");
    await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue(slot.start);
  });
});
