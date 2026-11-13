import { addDays, isOpenWeekday, type LocalDate, localDateOf } from "@espacios/domain";
import { expect, type Page, test } from "@playwright/test";

import { CENTRAL, START_TIMES } from "./facility";
import { waitForHydration } from "./fixtures";
import { sessionCookie, sessionCookieState, USERS } from "./session";

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

/**
 * An open weekday from 3 to 40 days ahead whose next week's same weekday is in the same month, so a move of one week in
 * the calendar stays on the data the page has.
 */
function keyboardDay(): LocalDate {
  let date = addDays(localDateOf(new Date(), CENTRAL.timeZone), 3);
  while (!isOpenWeekday(date, CENTRAL) || Number(date.slice(8)) > 21) date = addDays(date, 1);
  return date;
}

/** `2026-12-21` as the lists show it, `21/12/2026`. */
const shown = (date: LocalDate) => date.split("-").reverse().join("/");

/** The seeded sede of every room the tests book. */
const SEDE = "facility-central";

/**
 * The search for one half hour window as the page mirrors it in its address (spec 0008), optionally with the room
 * already chosen. Tests that run in parallel book different rooms.
 */
const searchLink = (slot: Slot, roomId?: string) =>
  `/reservas/nueva?sede=${SEDE}&fecha=${slot.date}&duracion=30&inicio=${slot.start}${roomId ? `&sala=${roomId}` : ""}`;

type Slot = ReturnType<typeof freeSlot>;

const confirmButton = (page: Page) => page.getByRole("button", { name: "Confirmar reserva" });
/** The summary card of the choice; the phone's copy is hidden on a desktop viewport. */
const summary = (page: Page) => page.getByRole("region", { name: "Tu reserva" });
const refusal = (page: Page) => page.getByRole("alertdialog", { name: "No se pudo completar" });

/** Opens the search on the window and the room and confirms it. The caller checks how it ended. */
async function book(page: Page, slot: Slot, roomId: string) {
  await page.goto(searchLink(slot, roomId));
  await waitForHydration(page);
  await confirmButton(page).click();
}

/** The booking's row in Mis reservas (Próximas). */
const bookingRow = (page: Page, slot: Slot, room: string) =>
  page
    .getByRole("row")
    .filter({ hasText: room })
    .filter({ hasText: shown(slot.date) })
    .filter({ hasText: `${slot.start} a ${slot.end}` });

test.describe("book a room (specs 0003, 0008 and 0011)", () => {
  test("a member picks a room in the search, confirms it and sees it in Mis reservas", async ({ page }) => {
    const slot = freeSlot();
    await page.goto(searchLink(slot));
    await waitForHydration(page);
    await page.getByRole("radio", { name: /^Sala Mar/ }).click();
    await expect(summary(page)).toContainText(`${slot.start} a ${slot.end}`);
    await confirmButton(page).click();

    // The booking keeps the user on the search; the toast leads to Mis reservas.
    await expect(page.getByText("Reserva confirmada")).toBeVisible();
    await expect(page).toHaveURL(/\/reservas\/nueva\?/);
    await page.getByRole("button", { name: "Ver en Mis reservas" }).click();
    await expect(page).toHaveURL(/\/\?vista=proximas/);
    const row = bookingRow(page, slot, "Sala Mar");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(USERS.ana.name);
    await expect(row).toContainText("Confirmada");
  });

  test("a room taken while the search was open is refused in the error dialog, and the choice stays", async ({
    page,
    context,
    browser,
  }) => {
    const slot = freeSlot();
    await context.clearCookies();
    await context.addCookies([sessionCookie(USERS.carla.id)]);
    await page.goto(searchLink(slot, "room-luna"));
    await waitForHydration(page);

    // Ana takes the same window through the API while Carla's page still shows it free.
    const ana = await browser.newContext({
      storageState: { cookies: [sessionCookieState(USERS.ana.id)], origins: [] },
    });
    const taken = await ana.request.post("/api/v1/bookings", {
      data: {
        roomId: "room-luna",
        startsAt: `${slot.date}T${slot.start}:00-03:00`,
        endsAt: `${slot.date}T${slot.end}:00-03:00`,
      },
    });
    expect([200, 201], await taken.text()).toContain(taken.status());
    await ana.close();

    await confirmButton(page).click();
    await expect(refusal(page)).toContainText("La sala ya está reservada en ese horario");
    // Nothing about the other booking: no company, no user.
    await expect(refusal(page)).not.toContainText(USERS.ana.company);
    await expect(refusal(page)).not.toContainText(USERS.ana.name);
    await refusal(page).getByRole("button", { name: "Entendido" }).click();
    await expect(refusal(page)).toBeHidden();
    await expect(confirmButton(page)).toBeFocused();
    await expect(summary(page)).toContainText("Sala Luna");
    await expect(summary(page)).toContainText(`${slot.start} a ${slot.end}`);
  });

  test("a member cancels a booking, it moves to Canceladas, and another company can take the slot", async ({
    page,
    context,
  }) => {
    const slot = freeSlot();
    await book(page, slot, "room-luna");
    await expect(page.getByText("Reserva confirmada")).toBeVisible();

    // The toast's way to Mis reservas opens the table on the new booking's page.
    await page.getByRole("button", { name: "Ver en Mis reservas" }).click();
    await expect(page).toHaveURL(/\/\?vista=proximas/);
    const row = bookingRow(page, slot, "Sala Luna");
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
    await book(page, slot, "room-luna");
    await expect(page.getByText("Reserva confirmada")).toBeVisible();
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

  test("a search link chooses the window and the room, and values it would not offer fall back", async ({ page }) => {
    const slot = freeSlot();
    await page.goto(searchLink(slot, "room-mar"));
    await expect(summary(page)).toContainText("Sala Mar");
    await expect(summary(page)).toContainText(`${slot.start} a ${slot.end}`);

    // An unknown room and a start off the 30 minute grid leave nothing chosen.
    await page.goto(`/reservas/nueva?sede=${SEDE}&fecha=${slot.date}&duracion=30&inicio=10:15&sala=room-nope`);
    await expect(page.getByText("Elegí un día, un horario y una sala para ver el resumen.")).toBeVisible();
    await expect(summary(page)).toHaveCount(0);
  });

  test("a day is picked with the keyboard only in the month calendar", async ({ page }) => {
    const day = keyboardDay();
    await page.goto(`/reservas/nueva?sede=${SEDE}&fecha=${day}`);
    await waitForHydration(page);
    const grid = page.getByRole("grid");
    const selected = grid.getByRole("button", { name: /seleccionado$/ });
    await selected.focus();
    // One week later is the same weekday, in the same month, so it is always bookable.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`fecha=${addDays(day, 7)}`));
    await expect(selected).toBeFocused();
  });

  test("the calendar disables the days the sede is closed and says why", async ({ page }) => {
    await page.goto("/reservas/nueva");
    const grid = page.getByRole("grid");
    // Every week of the shown month has a Saturday, so there is always a closed day in it.
    await expect(grid.getByRole("button", { name: /^sábado/ }).first()).toBeDisabled();
    await expect(page.getByText(/Se reserva de lunes a viernes, hasta 60 días adelante/)).toBeVisible();
  });

  test("a session that ended while the search was open offers a way back to the picker", async ({ page, context }) => {
    const slot = freeSlot();
    await page.goto(searchLink(slot, "room-mar"));
    await waitForHydration(page);
    await context.clearCookies();
    await confirmButton(page).click();

    await expect(refusal(page)).toContainText("Tu sesión no es válida o venció");
    await expect(refusal(page).getByRole("link", { name: "Elegir usuario de nuevo" })).toHaveAttribute(
      "href",
      "/ingresar",
    );
    // The page under an open alert dialog is hidden from the accessibility tree, so the choice is read once it closes.
    await refusal(page).getByRole("button", { name: "Entendido" }).click();
    await expect(confirmButton(page)).toBeFocused();
    await expect(summary(page)).toContainText(`${slot.start} a ${slot.end}`);
  });
});
