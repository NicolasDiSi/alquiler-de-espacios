# 0007 · Client detail: activity, metrics and calendar

**Status**: Assumed
**Date**: 2026-11-12
**Authorized by**: Nicolas Di si, during /develop

## Owed decision

What the operator sees on one client's page (scope backlog: "Operator detail view per company", needs a decision), where each value comes from, which calendar library draws the bookings, and what "add" means on a screen where the operator may not book (spec 0004). The engineer brought a reference image and a calendar template (`operador/clientes/calendar/`, FullCalendar 7, demo events) and asked to keep what fits and leave out what does not.

## Assumption built on

**Where it lives.** `/operador/clientes/[id]` grows from spec 0005 (data and members) into the client's activity page. The template folder `operador/clientes/calendar/` is removed once its calendar moves into the page.

**Period.** The same `?periodo=7d|30d|90d` as the dashboard (spec 0006), 30 days by default, read with `dashboardRanges`: complete days ending yesterday in Buenos Aires, the window before for the changes.

**Layout.** Header (logo, name, kind, state, code, sedes used, member count, since), actions (Editar, Bloquear horario, Desactivar or Reactivar), period, three indicator cards, then two tabs: "Reservas y actividad" (upcoming bookings, weekly pattern, calendar, history) and "Miembros" (the spec 0005 member list).

**Add on the calendar is a block, never a booking.** Spec 0004 stands: the operator does not book or cancel for a client and its login has no write on `booking`. "Bloquear horario" (a header button, or selecting a time range in the week or day view) opens the spec 0005 block dialog with a sede and room choice, prefilled with the selection. A refusal lists the bookings in the way, as on the sede page.

**Calendar library.** FullCalendar 7 (`@fullcalendar/react` 7.1.4, MIT, with its `temporal-polyfill` peer and the `es` locale), drawn by `EventCalendarViews` (`apps/web/src/components/calendar/`), copied unchanged from the engineer's `nextjs-templates` project: FullCalendar styled with Tailwind on the app tokens, no theme plugin. The toolbar follows that project's calendar page: title and "N días · M reservas", a sede filter, previous, today and next, the view, and "Bloquear horario" where the template had "Add event". Month, week and day views of this client's bookings, read through `GET /api/v1/operator/bookings?companyId&from&to` from the browser as the visible range changes (paged with the cursor until the range is complete). The range is fetched in an effect and the calendar gets a plain list, and it renders only once its owner has mounted, because the controller updates the owner as soon as the calendar connects. Read only: clicking a booking shows its details. No `date-fns`: titles use `Intl`.

**New reads (operator port, SQL, spec 0004 definitions).** `clientActivity(range, companyId, now)`: booked minutes and confirmed bookings per room (with its facility) and per weekday of the client in the range, and its confirmed bookings still to come. `OperatorBookingRecord.room` gains its facility name, so lists say "Sala, Sede" (an added field in `GET /operator/bookings`).

**Value sourcing.**

| On screen                                    | Source                                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Name, logo, kind, state, code, since         | `getClient` (`createdAt` is "Cliente desde")                                                                                              |
| Sedes                                        | facilities of `clientActivity` rooms with booked time in the period                                                                       |
| Miembros                                     | `listMembers`                                                                                                                             |
| Horas reservadas, change, share of the total | `getCompanyMetrics` for this client, current and previous window (`bookedMinutes`, `share`)                                               |
| Reservas: realizadas, canceladas, tasa       | the same row: `confirmedCount`, `cancelledCount`, `cancellationRate`                                                                      |
| Reservas: próximas                           | `clientActivity.upcoming` (confirmed bookings starting after now, any date)                                                               |
| Sala preferida and its share                 | the `clientActivity` room with most booked minutes (ties by name), over the client's booked minutes                                       |
| Próximas reservas (three cards)              | `listOperatorBookings` with `companyId`, `status: confirmed`, upcoming run, first three                                                   |
| Patrón semanal, día de mayor demanda         | `clientActivity` weekdays: booked hours per weekday of the period, the highest marked                                                     |
| Duración media                               | booked hours over confirmed bookings of the period                                                                                        |
| Calendar                                     | `GET /api/v1/operator/bookings?companyId&from&to` for the visible range                                                                   |
| Historial                                    | `listOperatorBookings` with `companyId` and the period, every page up to 500 rows; search by room or member, filter by state, 10 per page |

**Left out of the reference** (no source in the data model): the account tier ("Enterprise Corporativo"), CUIT, industry, "Servidor Sincronizado", Informe mensual, Datos fiscales, Gestionar cupo and the hours quota card (no plans), the Políticas tab, QR check in, meeting titles (a booking has no subject) and the peak hours band. Booking ids are not shown as `#RES-…` codes.

**Empty values** show a dash, never 0%.

## Code area

- `packages/application/src/ports/operator-queries.ts`, `packages/application/src/use-cases/client-activity.ts`, `packages/application/src/use-cases/operator-bookings.ts`
- `packages/db/src/operator-queries.ts`, `packages/db/src/operator-metrics.test.ts`
- `apps/web/src/app/(app)/operador/clientes/[id]/`, `apps/web/src/components/calendar/`, `apps/web/messages/es.json`, `docs/api/operator.md`

## Requirements

- **AC-1**: The operator sees the client's hours, bookings (done, cancelled, upcoming, rate) and preferred room for a chosen period, each with its source above, a dash when there is nothing to measure.
- **AC-2**: The weekly pattern shows the client's booked hours per weekday of the period and names the busiest day.
- **AC-3**: The calendar shows only this client's bookings in month, week and day views, and never offers to book; selecting a range opens the block dialog prefilled.
- **AC-4**: The history lists the client's bookings of the period with search, a state filter and pages.
- **AC-5**: A company member gets 403 on the page and on every read behind it; an unknown client is 404.
- **AC-6**: `clientActivity` is proven on the hand computed metrics dataset (per room, per weekday, upcoming, cancelled never counted).

## Ratify

This decision was recorded by /develop, not deliberated. Run `/architect client detail` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
