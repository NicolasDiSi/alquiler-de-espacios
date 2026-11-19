import { addDays, isOpenWeekday, type LocalDate, localDateOf } from "@espacios/domain";
import { expect, type Page, test } from "@playwright/test";

import { CENTRAL, START_TIMES } from "./facility";
import { waitForHydration } from "./fixtures";
import { sessionCookie, USERS } from "./session";

/** Rows per page of every table of the app (`DATA_TABLE_PAGE_SIZE`). */
const PAGE_SIZE = 10;

/** The next `count` weekdays from 40 days ahead: inside the 60 day horizon and clear of the seed's two weeks. */
function weekdaysFrom40(count: number): LocalDate[] {
  const days: LocalDate[] = [];
  let day = addDays(localDateOf(new Date(), CENTRAL.timeZone), 40);
  while (days.length < count) {
    if (isOpenWeekday(day, CENTRAL)) days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

/**
 * Gives Initech more than two pages of upcoming bookings through the API: Sala Sol, every half hour from 40 days ahead.
 * Only this file books Sala Sol, and a repeat by the same company answers 200, so a reused server is fine.
 */
async function fillMoreThanTwoPages(page: Page) {
  const slots = weekdaysFrom40(3).flatMap((day) =>
    START_TIMES.map((start, index) => ({ day, start, end: START_TIMES[index + 1] ?? "20:00" })),
  );
  for (const { day, start, end } of slots.slice(0, PAGE_SIZE * 2 + 1)) {
    const response = await page.request.post("/api/v1/bookings", {
      data: { roomId: "room-sol", startsAt: `${day}T${start}:00-03:00`, endsAt: `${day}T${end}:00-03:00` },
    });
    expect([200, 201]).toContain(response.status());
  }
}

const tableRows = (page: Page) => page.locator("table tbody tr");

test.describe("Mis reservas (spec 0003)", () => {
  test("after booking: the toast, the Nueva badge, and a reload does not repeat them", async ({ page }) => {
    const [day] = weekdaysFrom40(1);
    const start = START_TIMES[Math.floor(Math.random() * (START_TIMES.length - 1))] ?? "08:00";
    const end = START_TIMES[START_TIMES.indexOf(start) + 1] ?? "20:00";
    // The search for that half hour in Sala Mar, as the page mirrors it in its address (spec 0008).
    await page.goto(`/reservas/nueva?sede=facility-central&fecha=${day}&duracion=30&inicio=${start}&sala=room-mar`);
    await waitForHydration(page);
    await page.getByRole("button", { name: "Confirmar reserva" }).click();

    // The booking keeps the user on the search; the toast's action opens Mis reservas with the new row marked.
    await expect(page.getByText("Reserva confirmada")).toBeVisible();
    await page.getByRole("button", { name: "Ver en Mis reservas" }).click();
    const row = tableRows(page)
      .filter({ hasText: `${start} a ${end}` })
      .filter({ hasText: "Sala Mar" });
    await expect(row.getByText("Nueva", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/\?vista=proximas$/);

    await page.reload();
    await expect(page.getByText("Nueva", { exact: true })).toHaveCount(0);
  });

  test("the three views are links, the current one marked, each in its own order and state", async ({ page }) => {
    await page.goto("/");
    const views = page.getByRole("navigation", { name: "Vistas de reservas" });
    await expect(views.getByRole("link", { name: "Próximas" })).toHaveAttribute("aria-current", "page");

    await views.getByRole("link", { name: "Pasadas" }).click();
    await expect(page).toHaveURL(/vista=pasadas/);
    await expect(views.getByRole("link", { name: "Pasadas" })).toHaveAttribute("aria-current", "page");
    await expect(tableRows(page).filter({ hasText: "Confirmada" })).toHaveCount(0);

    await views.getByRole("link", { name: "Canceladas" }).click();
    await expect(page).toHaveURL(/vista=canceladas/);
    const cancelled = page.getByRole("columnheader", { name: "Cancelada el" });
    const empty = page.getByRole("heading", { name: "No hay reservas canceladas" });
    await expect(cancelled.or(empty)).toBeVisible();
  });

  test("the table searches, filters and pages the bookings, as every list of the app does", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await context.addCookies([sessionCookie(USERS.diego.id)]);
    await fillMoreThanTwoPages(page);

    await page.goto("/");
    await waitForHydration(page);
    await expect(tableRows(page)).toHaveCount(PAGE_SIZE);
    const pages = page.getByRole("navigation", { name: "Páginas" });
    await expect(pages).toContainText("Página 1 de");
    await pages.getByRole("button", { name: "Siguiente" }).click();
    await expect(pages).toContainText("Página 2 de");

    // The search narrows every booking of the view, not only the page in sight, and starts again from page 1.
    await page.getByRole("searchbox", { name: "Buscar por sala, sede o persona" }).fill("Sol");
    await expect(pages).toContainText("Página 1 de");
    const rows = tableRows(page);
    await expect(rows).toHaveCount(PAGE_SIZE);
    for (const row of await rows.all()) await expect(row).toContainText("Sala Sol");
  });

  test("on a phone each booking is a card and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("table")).toBeHidden();
    await expect(
      page
        .getByRole("list", { name: /Próximas reservas/ })
        .getByRole("listitem")
        .first(),
    ).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the API refuses a cursor from another view and a member never sees another company's bookings", async ({
    page,
  }) => {
    const first = await page.request.get("/api/v1/bookings?view=upcoming&limit=1");
    const { nextCursor } = (await first.json()) as { nextCursor: string | null };
    expect(nextCursor).not.toBeNull();
    const wrongView = await page.request.get(`/api/v1/bookings?view=past&cursor=${nextCursor}`);
    expect(wrongView.status()).toBe(400);

    await page.context().clearCookies();
    await page.context().addCookies([sessionCookie(USERS.carla.id)]);
    const asGlobex = await page.request.get(`/api/v1/bookings?view=upcoming&cursor=${nextCursor}`);
    expect(asGlobex.status()).toBe(200);
    const body = await asGlobex.text();
    expect(body).not.toContain(USERS.ana.name);
    expect(body).not.toContain("Bruno (Acme)");
  });
});
