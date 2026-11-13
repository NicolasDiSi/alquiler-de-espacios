import { addDays, isOpenWeekday, type LocalDate, localDateOf } from "@espacios/domain";
import { expect, type Page, test } from "@playwright/test";

import { expectNoViolations } from "./contrast";
import { CENTRAL, START_TIMES } from "./facility";
import { waitForHydration } from "./fixtures";
import { sessionCookieState, USERS } from "./session";

/** The Nth open weekday from 50 days ahead (inside the booking horizon, clear of the seed), as ISO and as typed. */
function dayAhead(nth: number): { iso: LocalDate; typed: string } {
  let day = addDays(localDateOf(new Date(), CENTRAL.timeZone), 50);
  for (let open = -1; ; day = addDays(day, 1)) {
    if (isOpenWeekday(day, CENTRAL)) open++;
    if (open === nth) return { iso: day, typed: day.split("-").reverse().join("/") };
  }
}

/** A weekday somewhere in the next year at random, so a reused server never finds the time already blocked. */
function randomFutureDay(): string {
  let day = addDays(localDateOf(new Date(), CENTRAL.timeZone), 100 + Math.floor(Math.random() * 250));
  while (!isOpenWeekday(day, CENTRAL)) day = addDays(day, 1);
  return day.split("-").reverse().join("/");
}

/** The operator fills "Nuevo bloqueo" for Sala Luna on a day, from the sede's Bloqueos tab, and submits it. */
async function blockSalaLuna(page: Page, typed: string, reason = "Pintura") {
  await page.goto("/operador/sedes/facility-central");
  await waitForHydration(page);
  await page.getByRole("tab", { name: /Bloqueos/ }).click();
  await page.getByRole("button", { name: "Nuevo bloqueo" }).click();
  const form = page.getByRole("dialog", { name: "Nuevo bloqueo" });
  await form.getByLabel("Alcance").selectOption({ label: "Sala Luna" });
  await form.getByLabel("Desde (día)").fill(typed);
  await form.getByRole("button", { name: "Todo el día" }).click();
  await form.getByLabel("Motivo").fill(reason);
  await form.getByRole("button", { name: "Crear bloqueo" }).click();
  return form;
}

test.describe("nothing overlaps anything, and a refusal says why (operator)", () => {
  test.use({ storageState: { cookies: [sessionCookieState(USERS.operador.id)], origins: [] } });

  test("a block over a booking lists it by client, with a way to contact them, and keeps what was typed", async ({
    browser,
    page,
  }) => {
    const { iso, typed } = dayAhead(0);
    // Globex books Sala Luna at a random half hour of that day, through the API. A repeat by Globex answers 200.
    const globex = await browser.newContext({
      storageState: { cookies: [sessionCookieState(USERS.carla.id)], origins: [] },
    });
    const index = Math.floor(Math.random() * (START_TIMES.length - 1));
    const [start, end] = [START_TIMES[index] ?? "10:00", START_TIMES[index + 1] ?? "10:30"];
    const booked = await globex.request.post("/api/v1/bookings", {
      data: { roomId: "room-luna", startsAt: `${iso}T${start}:00-03:00`, endsAt: `${iso}T${end}:00-03:00` },
    });
    expect([200, 201], await booked.text()).toContain(booked.status());
    await globex.close();

    const form = await blockSalaLuna(page, typed);

    // The list is an alert dialog of its own on top of the form, never a table inside the form's alert.
    await expect(page.getByRole("alertdialog", { name: /reservas? confirmadas? lo impide/ })).toBeVisible();
    const dialog = page.getByTestId("error-dialog");
    const client = dialog.getByRole("region", { name: "Reservas de Globex SRL" });
    await expect(client.getByRole("listitem").filter({ hasText: `${start} a ${end}` })).toContainText("Sala Luna");
    await expect(client.getByRole("link", { name: "Contactar al cliente" })).toHaveAttribute(
      "href",
      "/operador/clientes/company-globex",
    );
    await expectNoViolations(page, "[data-testid=error-dialog]");

    await dialog.getByRole("button", { name: "Volver y cambiar los datos" }).click();
    await expect(dialog).toBeHidden();
    await expect(form.getByRole("button", { name: "Crear bloqueo" })).toBeFocused();
    await expect(form.getByLabel("Motivo")).toHaveValue("Pintura");
    await expect(form.getByLabel("Desde (día)")).toHaveValue(typed);
  });

  test("a second block on the same time is refused with its reason, and the first one stays", async ({ page }) => {
    const typed = randomFutureDay();

    await blockSalaLuna(page, typed, "Primero");
    await expect(page.getByText("Bloqueo creado")).toBeVisible();

    const form = await blockSalaLuna(page, typed, "Segundo");
    // No field holds this reason, so it comes in an alert dialog on top that has to be answered.
    const refusal = page.getByRole("alertdialog", { name: "No se pudo completar" });
    await expect(refusal).toContainText("Ya hay un bloqueo en ese horario");
    await refusal.getByRole("button", { name: "Entendido" }).click();
    await expect(refusal).toBeHidden();
    await expect(form.getByLabel("Motivo")).toHaveValue("Segundo");
    await form.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("tab", { name: /Bloqueos/ }).click();
    await expect(page.getByRole("row", { name: /Primero/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Segundo/ })).toHaveCount(0);
  });
});
