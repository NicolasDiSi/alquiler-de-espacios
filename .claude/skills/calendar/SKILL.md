---
name: calendar
description: Build and review the date picker and the room availability grid in alquiler-de-espacios. Use when adding or changing a date picker, a day or week availability view, a time slot selector, or anything that shows bookable time in apps/web.
---

# Calendar and availability

Two different components. Pick the right one first.

| Need | Component | Base |
| ---- | --------- | ---- |
| Choose a date (filter, booking date) | Date picker: a popover or dialog with a month grid | shadcn `calendar` (react-day-picker). Add it with `npx shadcn@latest add calendar`; it is not installed yet. |
| See bookings and blocks over time (a room, a client, a sede), pick a range to book or block | Month, week and day calendar | FullCalendar 7 through `EventCalendarViews` (`apps/web/src/components/calendar/`, specs 0007 to 0009), customized where used, never inside. Rooms side by side is the spec 0009 day per room mapping: resource views are a paid plugin. Never a hand drawn picture. |

Never use the date picker to show availability, and never use the calendar views to pick a far away date (that is "Ir a fecha"). Every calendar keeps a keyboard path outside it (a table or a button), because a range cannot be picked by keyboard.

## Decisions this skill does not make

Time zone, slot granularity, opening hours, minimum and maximum length and the cancellation window are owed to `/architect` (see AGENTS.md). Read `docs/specs/` and `docs/adr/` first. If they are not recorded, stop and route to `/architect`. Format dates with the zone and locale (es-AR) from that decision, never `new Date().toLocaleString()` with defaults.

## Rules for the date picker (APG "Date Picker Dialog")

Source: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/ (advisory, test with a screen reader).

- Day buttons live in a grid with **one tab stop**. Arrows move by day and week, `Home` and `End` go to the start and end of the week, `PageUp` and `PageDown` change month, `Shift+PageUp/Down` change year. When the target day does not exist, land on the last day of the month.
- `Enter` or `Space` selects, closes and returns focus to the trigger. `Esc` closes without changing the value and returns focus to the trigger.
- On open, focus the selected date, or today when there is none.
- The month and year heading is a live region, so changing month is announced.
- Column headers carry the full day name (`abbr`) when the visible text is abbreviated.
- The trigger's accessible name includes the chosen date ("Cambiar fecha, 12 de noviembre de 2026").
- A typed date input stays available next to the picker, with the expected format in `aria-describedby`.
- Past dates are disabled with a reason, not hidden. The rule comes from the domain (`packages/domain`), the UI only displays it.

## Rules for the availability grid

Source for the state, mobile and pitfall rules: https://uxpatterns.dev/patterns/data-display/calendar

- Native `<table>` with a `<caption>` (day and, for the operator, scope), `<th scope="col">` for slots and `<th scope="row">` for rooms. No `role="grid"` unless cell navigation is a requirement and its keyboard contract is documented.
- Each bookable slot is a real `<button>` whose name says everything: "Sala A, 10:00 a 11:00, libre". Occupied slots are text with the same level of detail, not an empty coloured cell.
- State is never colour alone: free, occupied, mine and past also differ by text or icon. Use the semantic colours from `status-colors-and-errors`, few and one meaning each.
- Tenant isolation: a company sees its own bookings with detail and other companies' slots only as "ocupada". The operator view is a separate edge with full detail. The data comes from a query port and a view DTO (see `bff-edges`, `multi-tenant-safety`). The UI never filters private data client side.
- The grid shows the state, the database decides. A slot that looks free can still be refused: show the server's reason (overlap, past date, invalid range) in Spanish at the slot or in the form, and refresh the grid.
- Every state exists from the start and reserves its space: loading (skeleton), empty (no rooms), error with a retry, stale data after a failed refresh.
- Do not hide actions behind hover, do not truncate the room or time, keep targets at 44px or more on touch.
- Mobile is a deliberate fallback: below the table breakpoint render an agenda list per room instead of a shrunken grid. Do not scroll horizontally to hide essential slots.
- Test at 200% zoom and with `prefers-reduced-motion`.

## Tests

- Playwright with axe in `apps/web/e2e/` (see `e2e-patterns`): pick a date by keyboard only, book a slot, see the failure reason on an overlap, cancel.
- Unit test the date helpers around month ends, daylight saving (if the zone has it) and the day boundary in the chosen zone.
- Overlap and tenant visibility are proven against the real database, not here (`use-case-recipe`).

## Related skills

`accessible-data-tables-and-grids` for table semantics, `ui-density` for row height and touch targets, `shadcn` for adding the component and styling it, `nextjs-server-client` for where the grid fetches its data.
