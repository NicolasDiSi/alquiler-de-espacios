# 0008 · Rooms, room availability and a new booking by free time

**Status**: Assumed
**Date**: 2026-11-12
**Authorized by**: Nicolas Di si, during /develop

## Owed decision

How a client company sees the rooms and their availability, and books from it (scope features 14 and 6, and the booking form of feature 5): the screens, the read that tells every room's busy time at once, and what the engineer's three reference images keep or leave out. Spec 0001 already decides `room_busy_intervals`, the `GET /api/v1/rooms/{id}/availability` endpoint and that a company never learns who holds a busy slot.

## Assumption built on

**Screens (company edge, members only; the operator gets 403 as on every member page).**

- `/salas`: the rooms of one sede (a sede selector, the first by name by default), a search by name, quick filters (Todas, Libres ahora, Pequeñas up to 4, Medianas 5 to 9, Grandes 10 or more) with counts, and one card per room: name, capacity, sede, its state now (Libre ahora, Ocupada hasta HH:MM, No disponible ahora, Cerrada hoy), today's bar in 30 minute slots over the sede's opening hours (free, taken, yours, not available, the current time), and "Ver disponibilidad" and "Reservar". The header names the sede's hours today. A sidebar entry "Salas" for members.
- `/salas/[id]`: the room in the header (name, capacity, sede, hours, a room switcher) and its calendar with the client page controls (spec 0007): title, previous, today, next, go to date, Mes, Semana, Día, drawn by `EventCalendarViews`. Other companies' bookings read "Ocupada", the company's own "Tu reserva", blocks "No disponible", closed hours shaded. Picking a free range in the week or day view shows a bar with the range and "Reservar este horario", which opens `/reservas/nueva` prefilled. A range over busy time cannot be picked.
- `/reservas/nueva`: the sede, then the day (the month from `lg`, the week on a phone, a dot on each day with room), the duration (30 minutes to 4 hours), the people and "Solo salas libres"; the starts of the day with how many rooms are free for each; every room of the sede with room for the people as a card with its day as a bar and the chosen window marked on it, the smallest free one marked "Recomendada"; and the summary (a card from `lg`, a panel fixed at the bottom on a phone) that confirms through the existing `bookRoom` Server Action, so every refusal keeps its reason (spec 0003). Confirming never leaves the page: the action refreshes the page data either way (a refusal shows what changed, a booking shows as "Tu reserva"), a success clears the chosen room and shows a toast with "Ver en Mis reservas" (which opens Mis reservas with the booking marked "Nueva"), so several bookings can follow one another. This replaces the redirect of spec 0003. Choosing a room never books; only "Confirmar reserva" does. The URL mirrors the search (`?sede&mes&fecha&inicio&duracion&personas&sala&libres`) so it can be shared or reloaded.

**New read.** A migration adds `rooms_busy_intervals(p_from, p_to, p_room_id DEFAULT NULL)` next to `room_busy_intervals`: `SECURITY DEFINER`, owned by `espacios_availability`, returning `room_id`, `starts_at`, `ends_at`, `kind` (`booked` or `blocked`) and `mine` (a booked interval of `current_tenant_id()`, the tenant the unit of work set, never a parameter). `espacios_availability` gains `SELECT (tenant_id)` on `booking`. The company reads it through `TenantTransaction.availability`, so `mine` can only ever mean the caller's own company. One query for every room of a day: no read per room.

**Reading the booking search.** The page reads one thing on the server: `getFacilityMonth`, the sede's rooms and their busy time over the six weeks the month's calendar draws (at most 42 days). Everything else (the days with room, the day's starts, each room's slots and its fit for the window, the people, "solo libres", the chosen room) is derived in the browser from that data with the domain functions, the same ones the server uses, so a filter or a choice never asks the server again and needs no debounce. Only a new sede or a new month goes back to the server, with `router.replace` inside a transition (the current month stays on screen, dimmed, until the new one arrives); every other change updates the URL with `window.history.replaceState`, which Next.js syncs with its router without a request. The view is keyed by sede and month, so new data starts from the search the URL asked for. The derivation over six weeks runs in `useMemo` keyed by the duration and the people (React's case for it: a loop over thousands of slots whose inputs rarely change); the rest is computed in render. `loading.tsx`, `error.tsx` and a `<Suspense>` boundary for the month data are a later refinement.

**Rules (domain).** Each room's day in its sede's zone and hours: 30 minute slots, each `free`, `booked`, `mine`, `blocked` or `past`; a window's fit (`free`, `conflict`, `closed`, `outside_hours`, `past`) with the conflicting intervals, the free stretch before and after, the next booking and when the room is free again; the state now. The calendar range is at most 42 days.

**Endpoint.** `GET /api/v1/rooms/{id}/availability?from&to` (inclusive local days; `date` is the one day form of spec 0001): the room, each day's opening hours (or closed), and the busy intervals with `kind` and `mine`, never a company, a user, a booking id or a block's reason. 400 bad input, 404 unknown room, 422 `invalid_range` over 42 days. Members only in this version; the operator reading availability (spec 0001) waits for its own screen.

**Value sourcing.**

| On screen                                    | Source                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Rooms, capacity, sede, hours, open days      | `RoomCatalog.listRooms` (active rooms of active sedes)                               |
| Busy, yours, not available                   | `rooms_busy_intervals` through `TenantTransaction.availability`                      |
| Slots, state now, fit, free before and after | domain rules over the above, in the sede's zone, from the server's clock             |
| Shortcut days, offered starts and ends       | the booking rules of spec 0001 (`isBookableDay`, `startOptions`, the 30 minute grid) |
| Confirm and its refusals                     | `bookRoom` (spec 0003), unchanged                                                    |

**Left out of the references** (no source, or forbidden by tenant isolation): floor and sector, equipment chips and the equipment search, the "Directorios ejecutivos" filter, the grid and list toggle, "Ver grilla completa", meeting subjects and the "Asunto" field (engineer's call: no subject in this version), the monthly quota, the check in tolerance, rates and plans, "Última sincro", and any company or meeting name on another company's booking. A block shows "No disponible", never its reason ("mantenimiento").

## Code area

- `packages/db/prisma/migrations/`, `packages/db/src/availability.ts`, `packages/db/src/unit-of-work.ts`
- `packages/domain/src/booking/availability.ts`
- `packages/application/src/ports/`, `packages/application/src/use-cases/availability.ts`
- `apps/web/src/app/(app)/salas/`, `apps/web/src/app/(app)/reservas/nueva/`, `apps/web/src/app/api/v1/rooms/[id]/availability/`, `apps/web/src/navigation/sidebar-items.ts`, `apps/web/messages/es.json`

## Requirements

- **AC-1**: A member sees every room of a sede with its capacity, its state now and today's slots, filters them by size and by free now, and searches them by name.
- **AC-2**: A member sees one room's bookings by month, week and day: others' as "Ocupada" without any company detail, their own as "Tu reserva", blocks as "No disponible", and books a free range from it.
- **AC-3**: A member chooses a day, a time window and a capacity and sees which rooms are free for the whole window and which are not (with when they are free again), then confirms one; a refusal still says why.
- **AC-4**: `rooms_busy_intervals` marks `mine` only for the tenant of the transaction, never shows another company, and counts blocks; proven against the real database.
- **AC-5**: The operator gets 403 on the three pages and on the endpoint; an unknown room is 404.

## Ratify

This decision was recorded by /develop, not deliberated. Run `/architect room availability` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the features `done`.
