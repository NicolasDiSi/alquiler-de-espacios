import { addDays, isOpenWeekday, type LocalDate, localDateOf } from "@espacios/domain";
import { expect, test } from "@playwright/test";

import { contrastOf, expectNoViolations } from "./contrast";
import { CENTRAL } from "./facility";
import { waitForHydration } from "./fixtures";

const today = (): LocalDate => localDateOf(new Date(), CENTRAL.timeZone);

test("Ir a fecha marks the picked day in primary, in the picker and in the month, with readable text", async ({
  page,
}) => {
  let target = addDays(today(), 8);
  while (!isOpenWeekday(target, CENTRAL)) target = addDays(target, 1);

  await page.goto(`/salas/room-sol?fecha=${today()}&vista=mes`);
  await waitForHydration(page);
  await page.getByRole("button", { name: "Ir a fecha" }).click();
  const popover = page.locator("[data-slot=popover-content]");
  const cell = popover.locator(`td[data-day="${target}"]:not([data-outside])`);
  if ((await cell.count()) === 0) await popover.getByRole("button", { name: "Ir al mes siguiente" }).click();
  await expectNoViolations(page, "[data-slot=popover-content]");
  await cell.getByRole("button").click();

  // The month jumps to the day and frames its whole cell, the number filled with primary and readable (WCAG 1.4.3).
  const picked = page.locator(`[role=cell][data-date="${target}"]`);
  await expect(picked).toHaveClass(/fc-picked-day/);
  await expect(page.locator(".fc-picked-day")).toHaveCount(1);
  const number = picked.getByText(String(Number(target.slice(8))), { exact: true });
  expect(await contrastOf(number)).toBeGreaterThanOrEqual(4.5);
});
