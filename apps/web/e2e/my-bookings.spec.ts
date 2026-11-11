import { addDays, isOpenWeekday, type LocalDate, localDateOf, START_TIMES } from "@espacios/domain";
import { expect, type Page, test } from "@playwright/test";

import { waitForHydration } from "./fixtures";
import { sessionCookie, USERS } from "./session";

const PAGE_SIZE = 50;

/** The next `count` weekdays from 40 days ahead: inside the 60 day horizon and clear of the seed's two weeks. */
function weekdaysFrom40(count: number): LocalDate[] {
  const days: LocalDate[] = [];
  let day = addDays(localDateOf(new Date()), 40);
  while (days.length < count) {
    if (isOpenWeekday(day)) days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

/**
 * Gives Initech more than one page of upcoming bookings through the API: Sala Sol, every half hour of three days. Only
 * this file books Sala Sol, and a repeat by the same company answers 200, so a reused server is fine.
 */
async function fillMoreThanOnePage(page: Page) {
  const slots = weekdaysFrom40(3).flatMap((day) =>
    START_TIMES.map((start, index) => ({ day, start, end: START_TIMES[index + 1] ?? "20:00" })),
  );
  for (const { day, start, end } of slots.slice(0, PAGE_SIZE + 1)) {
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
    await page.goto(`/reservas/nueva?sala=room-mar&fecha=${day}&inicio=${start}&fin=${end}`);
    await waitForHydration(page);
    await page.getByRole("button", { name: "Reservar" }).click();

    await expect(page.getByText("Reserva confirmada")).toBeVisible();
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

  test("Ver más loads the next page, and a failed load keeps the rows and offers a retry", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await context.addCookies([sessionCookie(USERS.diego.id)]);
    await fillMoreThanOnePage(page);

    await page.goto("/");
    await waitForHydration(page);
    await expect(tableRows(page)).toHaveCount(PAGE_SIZE);

    await page.route("**/api/v1/bookings?**", (route) => route.abort());
    await page.getByRole("button", { name: "Ver más" }).click();
    const failure = page.getByRole("alert").filter({ hasText: "No pudimos cargar más reservas." });
    await expect(failure).toBeVisible();
    await expect(tableRows(page)).toHaveCount(PAGE_SIZE);

    await page.unroute("**/api/v1/bookings?**");
    await failure.getByRole("button", { name: "Reintentar" }).click();
    await expect.poll(() => tableRows(page).count()).toBeGreaterThan(PAGE_SIZE);
    // Keep loading until the end; the button is then replaced by a sentence.
    const more = page.getByRole("button", { name: "Ver más" });
    while (await more.isVisible()) await more.click();
    await expect(page.getByText("No hay más reservas")).toBeVisible();
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
