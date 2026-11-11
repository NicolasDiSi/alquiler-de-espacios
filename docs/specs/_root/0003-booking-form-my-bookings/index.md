# 0003. Booking form and my bookings screens

**Date**: 2026-11-11
**Status**: In Progress

## Summary

A company member books a room on its own page, `/reservas/nueva`, and sees every booking of their company on `Mis reservas` (`/`), split into three views: upcoming, past and cancelled. The form uses a calendar for the date and two lists of half hour marks for the time, so most rule mistakes cannot be made, and anything the server still refuses comes back as a clear Spanish message next to the right field. This spec covers the two screens and the booking and listing behind them; the rules, the API and the error contract come from spec 0001, which this spec extends in two small places (a `view` parameter on the list endpoint, and `phase` plus `createdAt` in the booking view).

## Requirements

**User stories**:
- As a company member, I want to pick a room, a day and a time and book it, so that my team has the room.
- As a company member, I want to understand why a booking was refused, so that I can pick something that works.
- As a company member, I want to see my company's upcoming, past and cancelled bookings, so that I know what we hold and what happened.

**Acceptance criteria**:
- **AC-1**: A signed in member opens `/reservas/nueva`, picks a room, a date, a start and an end, and submits. The booking is stored under the member's company with `booked_by` set to the member, and the browser lands on `Mis reservas` (view `proximas`) with the toast "Reserva confirmada" and the new booking marked as new (a "Nueva" badge, not color alone) when it is on the first page.
- **AC-2**: `Mis reservas` lists every booking of the member's company, made by any member, in three views reached by URL (`/?vista=proximas|pasadas|canceladas`, default `proximas`): **Próximas** = confirmed and not ended, soonest first (a booking in progress shows "En curso"); **Pasadas** = confirmed and ended, most recent first; **Canceladas** = cancelled, most recent first. Each booking shows the room, the date, the start and end time, who booked it, its status as text, and when it was created (cancelled ones also show when they were cancelled), in `es-AR` and the Buenos Aires time zone.
- **AC-3**: A refused booking keeps every form value, shows the catalog message for its reason in an alert that receives focus, and marks the related field or fields invalid (`aria-invalid` plus the message linked with `aria-describedby`). Nothing is written.
- **AC-4**: A second company booking the same room for an overlapping time gets `conflict` with the fixed message ("La sala ya está reservada en ese horario...") and learns nothing about the other booking (no company, user or times).
- **AC-5**: Each rule violation returns its own reason from the `bookRoom` use case and through `POST /api/v1/bookings` with the spec 0001 status, and the Server Action shows it through the same `toActionResult` mapping (feature 4): `not_on_grid`, `outside_hours`, `invalid_range`, `too_short`, `too_long`, `past_date`, `beyond_horizon` (422), an unknown room `not_found` (404), a malformed request `invalid_input` (400).
- **AC-6**: N parallel booking requests for one room and slot from different companies give exactly one success and N minus 1 `conflict` (P-1). Two identical simultaneous requests from one company give one 201 and one 200 with the same booking (P-11); the form treats both as success.
- **AC-7**: With no prefill, the form opens on the next open day (today in Buenos Aires if it is Monday to Friday and a start time is still ahead, otherwise the next weekday), with room and times empty. The date picker disables past days, Saturdays, Sundays and days beyond 60 days, and a visible hint says why. The start list offers 08:00 to 19:30 every 30 minutes (on today, starts already passed are disabled); the end list offers only times after the start, up to 4 hours later and never after 20:00.
- **AC-8**: `/reservas/nueva?sala=<roomId>&fecha=YYYY-MM-DD&inicio=HH:mm&fin=HH:mm` prefills the matching fields. A value that is malformed, an unknown room, a closed day or a time off the lists is ignored, and that field falls back to its default; the server validates everything again on submit.
- **AC-9**: A `busy` refusal shows the alert with a "Reintentar" button that submits the same values again. An `unauthenticated` refusal (the session expired while the form was open) shows the alert with a link to the picker (`/ingresar`).
- **AC-10**: "Ver más" loads the next page (50) of the current view through `GET /api/v1/bookings?view=<view>&cursor=<cursor>`. When there is nothing more, the button is replaced by "No hay más reservas". A failed load shows an inline error with a retry and keeps the rows already shown.
- **AC-11**: The `Mis reservas` header always offers "Nueva reserva". Each view has its own empty state; the Próximas one also offers "Nueva reserva".
- **AC-12**: A member never sees another company's bookings in any view, page of results or API answer, including with a forged cursor. The operator gets 403 on both pages and on `/api/v1/bookings`. Without a session the pages redirect to `/ingresar` and the API answers 401.
- **AC-13**: On wide screens the list is a native table (caption, column headers); below the `md` breakpoint each booking is a card in a list, with no horizontal scrolling. Every state reads without color, everything works with the keyboard, and the e2e axe check finds no violations on either screen.
- **AC-14**: `GET /api/v1/bookings` takes `view` (`upcoming`, `past`, `cancelled`, default `upcoming`), `cursor` and `limit` (default 50, max 100) and returns `{ bookings, nextCursor }` with the booking view DTO. An unknown `view`, a malformed cursor, or a cursor from another view answers 400 `invalid_input`.

## Decision

**Chosen option**: Option 1: two server rendered pages, one URL per list view.

The form is its own page (`/reservas/nueva`) posting the `bookRoom` Server Action; `Mis reservas` (`/`) renders each view on the server from a tenant scoped query port, and "Ver más" fetches the next page from the documented REST API.

**Implementation skills**: `nextjs-server-client` (local, `.claude/skills/nextjs-server-client/`) · `bff-edges` (local, `.claude/skills/bff-edges/`) · `use-case-recipe` (local, `.claude/skills/use-case-recipe/`) · `multi-tenant-safety` (local, `.claude/skills/multi-tenant-safety/`) · `pattern-catalog` (local, `.claude/skills/pattern-catalog/`) · `calendar` (local, `.claude/skills/calendar/`) · `accessible-data-tables-and-grids` (`smukh/a11y-agent-skills`, `.claude/skills/accessible-data-tables-and-grids/`) · `data-display-and-selection` (`dembrandt/dembrandt-skills`, `.claude/skills/data-display-and-selection/`) · `status-colors-and-errors` (`dembrandt/dembrandt-skills`, `.claude/skills/status-colors-and-errors/`) · `ui-density` (`dembrandt/dembrandt-skills`, `.claude/skills/ui-density/`) · `shadcn` (`shadcn/ui`, `.claude/skills/shadcn/`) · `e2e-patterns` (local, `.claude/skills/e2e-patterns/`)

**Design source**: the current UI. The shell, the theme tokens in `apps/web/src/app/globals.css` and the components shown on `/design-system` (shadcn `radix-nova`, Ant Design inspired). No `design.md` and no design tool. New components: shadcn `calendar` (added with the shadcn CLI) and the `select`, `popover`, `table`, `badge`, `alert`, `sonner` already installed.

**Relation to spec 0001**: this spec builds the `bookRoom` action, `POST /api/v1/bookings` and `GET /api/v1/bookings` that 0001 defines, and extends two of its points: the list endpoint gets a `view` parameter in place of 0001's `status`, `from` and `to` (the order differs per view), and the booking view DTO gains `phase` and `createdAt`. Everything else (rules, error table, pagination, idempotent repeat) is used as 0001 states it.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no schema change. Both screens read and write the existing tables of spec 0001.

| Table      | Fields used                                                                                               | Notes                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `booking`  | `id`, `tenant_id`, `room_id`, `booked_by`, `starts_at`, `ends_at`, `status`, `cancelled_at`, `created_at` | The `(tenant_id, starts_at, id)` index serves all three views (Pasadas and Canceladas read it backwards). The exclusion constraint guards overlap. |
| `room`     | `id`, `name`, `capacity`                                                                                  | Shared, read only for companies.                                                                                                                   |
| `app_user` | `id`, `name`                                                                                              | For "Reservada por".                                                                                                                               |

No subject field in v1 (a next version idea).

**State transitions**: stored status `confirmed → cancelled` (cancel is feature 7). The displayed **phase** is derived, never stored: `cancelled` if cancelled; else `finished` when `ends_at <= now`; else `in_progress` when `starts_at <= now`; else `upcoming`. Labels: Confirmada, En curso, Finalizada, Cancelada.

**Screens**:

_`/reservas/nueva` (member only)_
- Header: "Nueva reserva", a back link to `Mis reservas`.
- Fields, in order: **Sala** (select, "Sala Norte · 8 personas"), **Fecha** (a typed date input `dd/mm/aaaa` plus a calendar popover button, hint "Se reserva de lunes a viernes, hasta 60 días adelante"; both keep one hidden `date` field in `YYYY-MM-DD` in sync, which is what the form posts; typed text that cannot be read posts an empty `date`, so the server answers `invalid_input` with Fecha marked), **Inicio** and **Fin** (selects of `HH:mm`). Submit "Reservar", disabled and labelled "Reservando…" while pending.
- Dependent fields: when a change leaves the chosen start or end outside its new list (a later start, a switch to today with that start already passed), that field is cleared; a value that still fits is kept.
- One alert slot above the fields for a refusal (role `alert`, receives focus).
- No rooms at all: an empty state ("No hay salas cargadas", hint to run the seed) instead of the form.

_`/` Mis reservas (member only)_
- Header: title, description, primary "Nueva reserva" button.
- View switch: three links styled as tabs (Próximas, Pasadas, Canceladas) in a `nav`, the current one with `aria-current="page"`. Each is a URL, rendered on the server.
- Table columns (wide): Sala · Fecha · Horario · Reservada por · Estado · Creada (Canceladas adds "Cancelada el"). Caption names the view. Cards (narrow): the same data, room and time first.
- Below the list: "Ver más" or "No hay más reservas"; an inline error with "Reintentar" if a page fails.
- Loading: a skeleton of rows while a view renders (`loading.tsx`). Error: `error.tsx` with "Reintentar".
- After a booking: a `sonner` toast "Reserva confirmada" and the new booking with a "Nueva" badge; the `nueva` parameter is then removed from the URL so a reload does not repeat it.

**Field marks per reason** (AC-3):

| Reason                                   | Fields marked                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `not_found`                              | Sala                                                                      |
| `past_date`, `beyond_horizon`            | Fecha                                                                     |
| `outside_hours`, `not_on_grid`           | Inicio, Fin                                                               |
| `invalid_range`, `too_short`, `too_long` | Fin                                                                       |
| `conflict`                               | Inicio, Fin                                                               |
| `invalid_input`                          | the fields in the Zod error paths (`invalidFields`), or none (alert only) |
| `busy`, `unauthenticated`, `forbidden`   | none (alert only, with the AC-9 actions)                                  |

**API surface**:

| Endpoint / action        | Method      | Key inputs                                                                | Key outputs                                                                                                                 | Auth            | Key errors                                                   |
| ------------------------ | ----------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------ |
| `bookRoom` Server Action | POST (form) | `roomId`, `date` (`YYYY-MM-DD`), `start`, `end` (`HH:mm`)                 | success: redirect to `/?vista=proximas&nueva=<id>`; failure: the form state `{ result, values, invalidFields }` (see below) | member (cookie) | every reason in AC-5, `busy`, `unauthenticated`, `forbidden` |
| `/api/v1/bookings`       | POST        | `roomId`, `startsAt`, `endsAt` (RFC 3339 with offset)                     | booking view; 201 with `Location` when new, 200 for the exact repeat                                                        | member          | 400, 401, 403, 404, 409, 422, 503                            |
| `/api/v1/bookings`       | GET         | `view` (`upcoming`, `past`, `cancelled`), `cursor`, `limit` (50, max 100) | `{ bookings: BookingView[], nextCursor: string \| null }`                                                                   | member          | 400, 401, 403                                                |
| `/` page                 | GET         | `vista`, `nueva`                                                          | first page of the view                                                                                                      | member (page)   | redirect to `/ingresar`, 403                                 |
| `/reservas/nueva` page   | GET         | `sala`, `fecha`, `inicio`, `fin` (all optional)                           | the form                                                                                                                    | member (page)   | redirect to `/ingresar`, 403                                 |

**Form state** (what `bookRoom` returns to `useActionState` on failure): `result` is the `ActionResult` `{ ok: false, reason, message }` of feature 4, unchanged; `values` holds the submitted `roomId`, `date`, `start` and `end` so the form keeps them; `invalidFields` lists the fields to mark: for `invalid_input` the paths of the Zod errors, for any other reason the fields of the table above. `ActionResult` itself gains nothing.

**BookingView** (0001's DTO plus two fields): `id`, `room { id, name }`, `startsAt`, `endsAt` (ISO with `-03:00`), `status`, `phase`, `bookedBy { name }`, `createdAt`, `cancelledAt`. Never a company id or name.

**Cursor**: base64url of `{ view, startsAt, id }`. The query continues after that pair in the view's order; a cursor whose `view` differs from the request is `invalid_input`. The tenant is never in the cursor; it always comes from the session.

**Value sourcing**:

| Action | Value produced / displayed                       | Source                                                                                                                                                                                                     |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Book   | company id                                       | the session user's `app_user.tenant_id` (spec 0001), never the form                                                                                                                                        |
| Book   | `booked_by`                                      | user id from the signed cookie (0001)                                                                                                                                                                      |
| Book   | `startsAt`, `endsAt`                             | form `date` plus `start`/`end`, built server side in `America/Argentina/Buenos_Aires` by a `domain` function (0001)                                                                                        |
| Book   | rule limits (grid, hours, length, horizon, zone) | constants in `packages/domain` (0001)                                                                                                                                                                      |
| Book   | "now" for past and horizon                       | clock port (0001)                                                                                                                                                                                          |
| Book   | room exists                                      | `RoomCatalog.findRoom(id)` in the use case before the write; missing is `not_found`                                                                                                                        |
| Book   | 201 vs 200                                       | `INSERT ... ON CONFLICT DO NOTHING RETURNING id`, then the RLS scoped exact lookup (0001)                                                                                                                  |
| Book   | refusal message                                  | `messages/es.json` `errors.<reason>` via `toActionResult` (feature 4)                                                                                                                                      |
| Book   | success toast text                               | `success.bookingConfirmed`                                                                                                                                                                                 |
| Book   | which booking to mark new                        | the `nueva` URL parameter set by the action's redirect                                                                                                                                                     |
| Book   | values kept and fields marked on failure         | the form state `values` (the submitted form data) and `invalidFields` (Zod error paths, else the field table)                                                                                              |
| Form   | posted date                                      | the hidden `date` field, kept in sync by the typed input and the calendar                                                                                                                                  |
| Form   | room options                                     | `RoomCatalog.listRooms()` (name, capacity), read on the server                                                                                                                                             |
| Form   | default date                                     | `nextOpenDay(now)` in `domain`: today in Buenos Aires if Monday to Friday and before 19:30, else the next weekday                                                                                          |
| Form   | "now" shown to the client                        | the server's clock port at render, passed to the form as an ISO string                                                                                                                                     |
| Form   | disabled days and their hint                     | `domain` `isBookableDay(day, now)` (weekday, not past, within 60 days), imported by the client component                                                                                                   |
| Form   | start and end options                            | `domain` grid helpers: starts 08:00 to 19:30; ends from start + 30 min to min(start + 4 h, 20:00)                                                                                                          |
| Form   | prefill                                          | `sala`, `fecha`, `inicio`, `fin` query params, each checked against the room list and the helpers above; invalid ones dropped                                                                              |
| List   | which bookings                                   | `MyBookingsQuery.list(view, cursor, limit, now)` on the tenant transaction (RLS plus tenant filter)                                                                                                        |
| List   | view filter and order                            | upcoming: `status = confirmed AND ends_at > now` by `(starts_at, id)` ascending; past: `status = confirmed AND ends_at <= now` descending; cancelled: `status = cancelled` by `(starts_at, id)` descending |
| List   | `phase`                                          | `domain` `bookingPhase(booking, now)`, computed in the use case                                                                                                                                            |
| List   | room name, booked by name                        | joins to `room.name` and `app_user.name`                                                                                                                                                                   |
| List   | dates and times shown                            | next-intl formats with locale `es-AR` and time zone from `src/i18n/config.ts`                                                                                                                              |
| List   | current view                                     | `vista` URL parameter, default `proximas`; mapped to the API's `view`                                                                                                                                      |
| List   | next page                                        | `nextCursor` from the previous page; `limit` 50                                                                                                                                                            |

**Key invariants**:
- The company of every read and write comes from the session, never from the URL, the form or the cursor.
- A refused booking writes nothing (validation before the transaction; the database refusals roll back).
- The client side limits (disabled days, time lists, prefill checks) are only display; the server applies every rule again.
- A company never receives another company's name, user, booking id or times, including in `conflict`.
- `phase` is computed at read time, never stored.

**Patterns**:
- Same room and time at once: overlap guarded by the database (spec 0001), proof P-1 in `packages/db` against real Postgres.
- Write that must not repeat: idempotent write, light form (0001): the button is disabled while pending, and an exact repeat by the same company returns the existing booking; proof P-11.
- Tenant data: tenant isolation twice; the list query filters by tenant and RLS filters again; proof: a test where company B lists, pages with a cursor taken from company A, and gets nothing of A's.
- Second kind of client: backends for frontends; both screens are on the company edge only, the operator gets 403 (spec 0002 edges); proof: e2e.
- Two writes in one action, cache, outside call, outbox, history: none fire (one insert, the list is never cached, cancelled rows already stay for history). Skipped.

**Security model**:
- Members of a company read every booking of their company and create bookings for it; nothing else.
- The operator cannot use either screen or the member API (403); its global view is feature 10.
- Unsigned visitors are redirected to `/ingresar` (pages) or get 401 (API).
- `POST /api/v1/bookings` requires `Content-Type: application/json` and a matching or absent `Origin` (spec 0001); the Server Action relies on Next.js origin checks.
- Query parameters (`sala`, `fecha`, `inicio`, `fin`, `vista`, `nueva`, `cursor`) are untrusted: validated with Zod, and `nueva` only highlights a row that is already in the company's own list. A hand typed `nueva` still shows the "Reserva confirmada" toast; it misleads only whoever typed it and reveals nothing, so it is accepted.

**Configuration required**: none. No new environment variables. One new dependency set through the shadcn CLI (`calendar`, which brings `react-day-picker`), subject to pnpm's minimum release age.

**Critical test scenarios**:
- Happy path: book through the form, land on Próximas with the toast and the "Nueva" badge, verifies **AC-1**, **AC-2**.
- Failure case: a second company books an overlapping slot and sees only the fixed conflict message on the time fields, verifies **AC-3**, **AC-4**.
- Concurrency: N parallel inserts across companies give one winner; a same company double submit gives 201 and 200 with one booking, verifies **AC-6**.
- Rules: each rule violation returns its reason from the use case and its status through the API; the action relies on `toActionResult`'s existing test, verifies **AC-5**.
- Auth/permission: the operator gets 403 on both pages and the API; company B cannot see A's bookings even with A's cursor, verifies **AC-12**.

## Build plan

Tracer Bullet: tasks 1 to 5 build one thin real thread (book through a minimal form, see it in a one view list) through every layer; tasks 6 to 8 thicken the form, the list and the proofs.

1. `domain`: booking rule constants, zone conversion of date plus `HH:mm` (Intl only, with a test that Buenos Aires has no daylight saving), `validateBooking(input, now)` returning one reason per rule, `bookingPhase`, `isBookableDay`, `nextOpenDay` and the grid option helpers, each with unit tests (P-7), satisfies **AC-5**, **AC-7**
2. `application`: ports `BookingRepository` (`insertIfFree`, `findExactConfirmed`) and `MyBookingsQuery` (`list(view, cursor, limit, now)`), `RoomCatalog.findRoom`; use cases `bookRoom` (validate, room exists, insert, exact repeat, `withRaceHandling`) and `listMyBookings`; tests with in memory fakes and a manual clock, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**
3. `db`: the repository (`INSERT ... ON CONFLICT DO NOTHING RETURNING id` as raw SQL, exact lookup), the list query per view with the keyset cursor, `findRoom`, wired into `TenantTransaction`; integration tests P-1, P-2, P-11 and the cross company cursor test, satisfies **AC-2**, **AC-4**, **AC-6**, **AC-12**
4. `web` edges: composition wiring, `POST` and `GET /api/v1/bookings` (Zod, `view`, cursor, `failureResponse`), the `bookRoom` Server Action with `toActionResult` and the form state (`values`, `invalidFields`), satisfies **AC-5**, **AC-12**, **AC-14**
5. Thin thread UI: `/reservas/nueva` with native fields (room select, date input, start and end selects) and the alert; `/` showing the Próximas first page as a plain table; the success redirect, satisfies **AC-1**, **AC-3**
6. Thicken the form: shadcn calendar popover with disabled days and hint (synced to the hidden `date`), dependent end list with clearing of values that no longer fit, defaults, prefill, field marks per reason, the `busy` retry and the `unauthenticated` link, satisfies **AC-3**, **AC-7**, **AC-8**, **AC-9**
7. Thicken the list: the three views as URL tabs, phase badges, all row details, table plus cards below `md`, empty states, the toast and "Nueva" badge, "Ver más" through the REST API with its error retry, `loading.tsx` and `error.tsx`, satisfies **AC-2**, **AC-10**, **AC-11**, **AC-13**
8. Catalog strings and e2e with axe: book and see it, the conflict message from a second company, a prefill link, picking a date with the keyboard, operator 403 and signed out redirect, satisfies **AC-1**, **AC-4**, **AC-8**, **AC-12**, **AC-13**

## Consequences

**Positive**:
- Every step of the main thread is real and visible: the form, the rules, the overlap guard and the list.
- Each view and the prefilled form have their own URL, so feature 6's grid and feature 7's cancel slot in without changing these screens.
- Most rule mistakes cannot be made in the form, and the ones left map to one message and one field.

**Negative / tradeoffs**:
- The form cannot show that a slot is taken before submitting; a taken slot is found out on submit until feature 6 adds the grid.
- Because the form prevents most rule mistakes, AC-5 is mostly proven through the API and the use case tests, not through the screen.
- Both pages read the session cookie, so they render per request (no static prerender); that is expected for private data but differs from the shell's current "pages read no cookies" rule.
- `react-day-picker` is a new dependency to keep updated.
- The "Nueva" badge only shows when the new booking is on the first page of Próximas (50 earlier upcoming bookings push it out); the toast still confirms it.

**Neutral**:
- Spec 0001's list parameters `status`, `from`, `to` are replaced by `view` for this release; the operator list (feature 10) keeps its own filters.
- The `nueva` URL parameter is removed after the toast shows.

## Follow-up

- [ ] `/sync`: `apps/web/AGENTS.md` says layouts and pages read no cookies; pages behind the session (`/`, `/reservas/nueva`, `/operador`) already do. Reword the rule for the shell versus private pages.
- [ ] Feature 6 links its free slots to `/reservas/nueva?sala=&fecha=&inicio=&fin=`.
- [ ] Feature 7 adds the cancel action to Próximas rows and moves cancelled bookings to Canceladas.
- [ ] README "Supuestos": the default date rule, and that the whole company shares one bookings list.
- [ ] README "next version": a subject per booking, a "solo las mías" filter, showing busy times in the form.
