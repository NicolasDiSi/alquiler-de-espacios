# 0009 · Rooms matrix at /salas

**Status**: Assumed
**Date**: 2026-11-12

Adds a calendar view to `/salas`; the room cards of spec 0008 stay as the other view. Builds on spec 0008 (busy time, the domain rules, `getFacilityMonth`).

## Design

- **Filters:** the sede, the week (previous, next, "Hoy", "Ir a fecha" with the date picker of the client page, spec 0007) and the people (1 to 40). The URL mirrors them (`?sede&fecha&personas`).
- **Views:** "Calendario" (the matrix below) or "Grilla" (spec 0008's cards: search by name, quick filters with counts, each room's state, now when the day is today, its day as a bar, and "Reservar"), `?vista=calendario|grilla`, applied in the browser. A room's column header, or its whole card, opens its detail on the chosen day.
- **Room detail (`/salas/[id]`):** the header of the other detail pages (back link, name, then its facts: sede, capacity, hours, days, time zone, with the shared `Facts` and `WeekDays`), then its availability as in spec 0008.
- **Day pills:** the seven days of the week; the days the sede opens are enabled, each with its free 30 minute slots for the people. The week of `fecha` is shown, this week by default.
- **Matrix:** the chosen day as a time grid drawn by `EventCalendarViews`, a column per room with room for the people (smallest first), rows every 30 minutes over the sede's hours. Busy time reads "Ocupada", "Tu reserva" or "No disponible", never whose. Time that can no longer be booked is shaded.
- **Booking:** a click or a drag over free time in one column (up to 4 hours, not in the past) draws a "Tu selección" card and opens a dialog: the room and the day fixed, the start and the length changeable (only free ones offered), "Confirmar reserva" through `bookRoom` (refusals keep their reason, a booking keeps the user on the page, spec 0008). "Cancelar", Escape or a click outside drop the card.

## Decisions

- **Columns per room without the paid plugin.** FullCalendar's free time grid puts days in columns; resource columns and `dayMinWidth` are in paid plugins. The matrix is a time grid of N days in UTC where day `i` from a fixed Monday stands for room `i`, so a column's clock is the sede's clock on the chosen day. The mapping lives in `apps/web/src/lib/bookings/room-matrix.ts` (`columnTime` in, `cellOf` out) and nowhere else. More rooms than fit scroll sideways.
- **Reading:** the page starts `getFacilityMonth` for the week without waiting and passes the promise; the matrix reads it with `use()` behind a `<Suspense>` with a skeleton, so the filters paint at once. Only a new sede or week goes back to the server (`router.replace`); the day and the people are applied in the browser and mirrored with `history.replaceState`.

## Open

- **Accessibility:** FullCalendar gives each column header a hidden full date (here the internal date, "1 de enero de 2001") and hides the header content (the room name and its link) from screen readers, and a range cannot be picked with the keyboard. Needs a keyboard and screen reader path (for example a "Reservar" action per room outside the grid) before this is done.
- The references' KPIs, demand per day, capacities and quick search cards, equipment, floor and meeting subjects are left out (no source, or forbidden by tenant isolation).

## Code area

`apps/web/src/app/(app)/salas/`, `apps/web/src/lib/bookings/room-matrix.ts`, `apps/web/src/lib/bookings/search.ts`, `apps/web/messages/es.json`
