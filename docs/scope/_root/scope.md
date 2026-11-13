# Scope: Alquiler de espacios

A web app where client companies see meeting room availability, book rooms and cancel their own bookings, and the operator sees how rooms and clients are used. Built for the Fontanella SRL challenge (brief in `docs/challenge.md`). Repo wide scope, because every feature crosses `packages/*` and `apps/web`.

**Build approach:** Tracer Bullet (one thin real thread through every layer first, a company books a room and sees it in its list, then each slice thickens one segment end to end).
**Workflow:** Beta (after develop, `/check verify` then `/test`). `/architect` is the recommended first stop for a feature with an open decision, skippable when the spec already covers it. Spec 0001 already decides the platform, roles, error contract, booking rules and metric definitions, so most features below start from it.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit. You decide when a feature is `done`._

## At a glance

Build order, by what each feature needs. Numbers never change (specs refer to them); the sections below stay grouped by slice.

| #   | Feature                                                                    | Phase      | Status      | Needs                                                     |
| --- | -------------------------------------------------------------------------- | ---------- | ----------- | --------------------------------------------------------- |
| 1   | Repo foundation: tooling, layer packages, web shell                        | Foundation | existing    | none                                                      |
| 2   | Database foundation: roles, FORCE RLS, schema, seeds                       | Foundation | done        | 1                                                         |
| 3   | Company identity: seeded users, signed cookie, picker                      | Foundation | done        | 1, 2                                                      |
| 4   | Result and error contract                                                  | Foundation | done        | 1                                                         |
| 5   | Book a room and see it in my bookings                                      | Slice 1    | in-progress | 2, 3, 4                                                   |
| 15  | Operator administration: facilities, rooms, clients, blocks (data and API) | Slice 4    | in-progress | 2, 3, 4                                                   |
| 8   | Operator metrics: queries and API                                          | Slice 4    | in-progress | 15 (built together, verify and test with it)              |
| 7   | Cancel a booking and free the slot                                         | Slice 3    | in-progress | 5                                                         |
| 6   | Room availability grid                                                     | Slice 2    | in-progress | 2, 5, 15 (facility hours and blocks)                      |
| 14  | Rooms list: every room, pick one to see it                                 | Slice 2    | in-progress | 6 (the link target), 15                                   |
| 10  | Operator global bookings view                                              | Slice 4    | in-progress | 15 (API)                                                  |
| 16  | Operator administration screens: sedes, rooms, clients, blocks             | Slice 4    | in-progress | 15                                                        |
| 17  | Client detail: activity, metrics and calendar                              | Slice 4    | in-progress | 15, 8                                                     |
| 9   | Operator dashboard                                                         | Slice 4    | in-progress | 15 and 8 (metrics API)                                    |
| 13  | Role based navigation in the sidebar                                       | Slice 1    | done        | 5, 14, 10, 9 (an entry appears only when its page exists) |
| 11  | End to end suite with accessibility checks                                 | Delivery   | in-progress | 5, 7, 6, 14, 10, 9, 13                                    |
| 12  | README, assumptions and AI usage                                           | Delivery   | done        | everything                                                |

## Foundations

### 1. Repo foundation: tooling, layer packages, web shell · existing

Monorepo, quality gates, hooks, `domain` / `application` / `db` packages, a database adapter skeleton and the web app shell. Predates this scope. code in `./`

### 2. Database foundation: roles, FORCE RLS, schema, seeds · done

The ground every slice stands on: cluster roles in the infra init SQL and test global setup, a non superuser owner, the `bookings`, `room` and user tables, the exclusion constraint, row level security with `FORCE`, the availability function, grants, and `pnpm db:seed`. Also amends ADR 0003 and `packages/db/AGENTS.md`.
**Done when:** a migration run as the owner creates the schema, an integration test as `espacios_app` proves isolation and the overlap constraint, the seed runs twice without duplicates under `FORCE`, and the README notes `docker compose down -v`.
- [x] Design it (spec): decided in spec 0001
- [x] Build it: `/develop database foundation`
- [x] Verify it: `/check verify database foundation`
- [x] Test it: `/test database foundation`
  Spec 0001 · code in `packages/db/`, `infra/`

### 3. Company identity: seeded users, signed cookie, picker · done

A "sign in as" picker that sets an HMAC signed cookie; the server resolves the company from it, never from client input. Company and operator edges, 401 and 403 rules, Origin check.
**Done when:** picking a seeded user sets a signed cookie, a tampered or expired cookie gets 401, a member cannot reach operator routes (403), and the company id used by every action comes from the cookie.
- [x] Design it (spec): decided in spec 0001
- [x] Build it: `/develop company identity`
- [x] Verify it: `/check verify company identity`
- [ ] Test it: `/test company identity` (skipped 2026-11-11 by the engineer: the build shipped 14 identity e2e tests and the session unit tests)
  Spec 0001, picker screen in spec 0002 (assumed decision, owes `/architect` ratification) · code in `apps/web/src/lib/session/`, `apps/web/src/app/ingresar/`, `packages/domain/src/identity/`, `packages/db/src/user-directory.ts`

### 4. Result and error contract · done

The typed `Result` with reason codes, `reasonToHttp`, the es-AR message catalog, the `sqlState(err)` helper and the `busy` mapping, so every later slice reports failures the same way.
**Done when:** every reason has one HTTP status and one Spanish message (a test iterates them), and a real `23P01`, `55P03` and `57014` coming out of Prisma map to `conflict` and `busy`.
- [x] Design it (spec): decided in spec 0001
- [x] Build it: `/develop result and error contract`
- [x] Verify it: `/check verify result and error contract`
- [x] Test it: `/test result and error contract`
  Spec 0001 · code in `packages/application/`, `packages/db/`, `apps/web/`

## Slice 1: the thin thread

### 5. Book a room and see it in my bookings · in-progress

The walking skeleton. A signed in company member picks a room, a date and a time, books it, and sees the booking in its own list. Real database, real rules (grid, hours, length, past, horizon), real overlap guard, real failure messages.
**Done when:** a booking is stored and listed under its company; a second company booking the same room and time gets `conflict` with a clear message; each rule violation shows its own reason; N parallel requests for one slot give exactly one success; a double submit by the same company returns the existing booking.
- [x] Design it (spec): `/architect booking form and my bookings screens`
- [x] Build it: `/develop book a room`
  - [x] Booking core: domain rules, the book and list use cases, the database proofs (P-1, P-2, P-11, cross company cursor) · AC-2, AC-4, AC-5, AC-6, AC-7, AC-12
  - [x] Thin thread: `POST` and `GET /api/v1/bookings`, the `bookRoom` Server Action, a minimal form and a one view list · AC-1, AC-3, AC-5, AC-12, AC-14
  - [x] Full form: calendar, defaults, prefill, field marks, the busy retry and the expired session link · AC-3, AC-7, AC-8, AC-9
  - [x] Full list and e2e: three views, cards on phones, "Ver más", empty, loading and error states, e2e with axe · AC-1, AC-2, AC-10, AC-11, AC-13
- [ ] Verify it: `/check verify book a room`
- [x] Test it: `/test book a room`
  Spec 0001 (rules, API, error contract) and [spec 0003](../../specs/_root/0003-booking-form-my-bookings/index.md) (the two screens) · code in `packages/domain/`, `packages/application/`, `packages/db/`, `apps/web/`

### 13. Role based navigation in the sidebar · done

The sidebar shows only the sections the signed in role can use, and only those that exist: a member sees "Mis reservas", "Nueva reserva" and "Salas"; the operator sees "Panel", "Reservas", "Sedes" and "Clientes".
**Done when:** a member never sees an operator entry and the reverse, an entry appears only when its page exists, the current page is marked for screen readers, and the sidebar works with the keyboard in both densities.
- [x] Build it: `/develop role based navigation`
  Spec 0001 (edges) and spec 0002 (landing per role) · code in `apps/web/src/navigation/`

## Slice 2: availability

### 14. Rooms list: every room, pick one to see it · in-progress, assumed decision (spec 0008)

What the brief calls "see the rooms and their availability": every room with its name and capacity, and a way into its availability. Feature 6 only covers one room's day; this decides how a company finds and chooses the room (a list, or all rooms side by side for one day).
**Done when:** a member sees all rooms with name and capacity, picks one and reaches its availability, the operator sees the same list, and an empty list explains itself.
- [ ] Design it (spec): assumed in [spec 0008](../../specs/_root/0008-room-availability-screens/index.md) with feature 6, `/architect room availability` to ratify
- [x] Build it: `/salas` as a week matrix of a sede's rooms (spec 0009) with the room cards as a second view ("Grilla"), booking from a picked range, and a rebuilt `/reservas/nueva` that searches free rooms by day, time and people
  Specs 0008 and [0009](../../specs/_root/0009-rooms-matrix/index.md) · code in `apps/web/src/app/(app)/salas/`, `apps/web/src/app/(app)/reservas/nueva/`

### 6. Room availability grid · in-progress, assumed decision (spec 0008)

A day view per room showing opening hours, other companies' busy intervals without any company detail, the caller's own bookings marked, and the free slots to pick.
**Done when:** a company sees that a room is taken without learning who holds it; closed days show no slots; an unknown room is 404; the operator can view it too through its own port.
- [ ] Design it (spec): assumed in [spec 0008](../../specs/_root/0008-room-availability-screens/index.md), `/architect room availability` to ratify
- [x] Build it: `/salas/[id]` calendar and `GET /api/v1/rooms/{id}/availability`, on `rooms_busy_intervals`
  Spec 0001 covers the function and the endpoint; the spec for this feature covers the screen.

## Slice 3: cancel

### 7. Cancel a booking and free the slot · in-progress

A member cancels any booking of their company before it starts, and the slot is free again immediately.
**Done when:** cancel works only before the start, a second cancel returns `already_cancelled`, another company's booking is `not_found`, cancelling a started booking returns `cancel_not_allowed`, and a cancelled slot can be rebooked at once.
- [x] Design it (spec): decided in spec 0001
- [x] Build it: `/develop cancel a booking`
- [ ] Verify it: `/check verify cancel a booking`
- [x] Test it: `/test cancel a booking`
  Spec 0001 · code in `packages/domain/src/booking/booking.ts`, `packages/application/src/use-cases/bookings.ts`, `packages/db/src/bookings.ts`, `apps/web/src/app/api/v1/bookings/[id]/cancel/`, `apps/web/src/app/(app)/(mis-reservas)/`

## Slice 4: operator view

### 8. Operator metrics: queries and API · in-progress

Occupancy per room and overall, usage per company (hours, bookings, cancellations, share, idle companies) and the weekday by hour heatmap, all in SQL through the operator port, with the `/api/v1/operator/metrics/*` endpoints.
**Done when:** on a seeded dataset with known numbers each metric matches by hand, cancelled bookings never count, a booking spanning hour cells is split, empty ranges return `null`, and the operator login cannot write.
- [x] Design it (spec): decided in spec 0001
- [x] Build it: `/develop operator metrics`
- [ ] Verify it: `/check verify operator metrics`
- [x] Test it: `/test operator metrics`
  Extended by feature 15 (spec 0004: per facility zone and hours, blocks, `insights`); build them together. Spec 0001 · code in `packages/db/`, `packages/application/`, `packages/domain/`, `apps/web/`

### 15. Operator administration: facilities, rooms, clients, blocks (data and API) · in-progress

Backend only, from [spec 0004](../../specs/_root/0004-operator-administration-and-metrics/index.md). The operator adds and retires facilities, rooms and clients through `/api/v1/operator/*`, blocks rooms or a whole facility, and reads the global bookings list and the metrics (rooms, companies, heatmap, insights). A person who works alone is a client of kind `individual` with one member. Facility owns the time zone and opening hours. It extends features 8 and 10 and replaces the constants of the booking rules. The screens come later.
**Done when:** the 21 acceptance criteria of spec 0004 hold, the booking proofs of specs 0001 and 0003 still pass on the default facility, and the guard trigger refuses a direct insert into an inactive room, outside the opening window or over a block.
- [x] Design it (spec): `/architect operator administration` (spec 0004)
- [x] Build it: `/develop operator administration`
  - [x] Migration: `facility`, `block`, room and company columns (`kind`, `logo_url`, `deactivated_at`, `active_from`), backfill, grants, booking guard trigger, seeds · AC-2, AC-3, AC-8, AC-9, AC-16, AC-19
  - [x] Domain and member path: facility rules replace the constants, new reasons, inactive rooms and companies refused · AC-7, AC-8, AC-9, AC-15, AC-16
  - [x] Operator edge: facilities, rooms, clients with members, deactivation, hours change with the affected bookings list · AC-1 to AC-7, AC-21
    - Done: thin CRUD, deactivation of rooms, facilities and clients (with company reactivation), the hours change check (`has_future_bookings` with its list) and the block creation refusal (`block_has_bookings` with its list), all in one operator transaction with the row locks. Proven against Postgres, including the race with a booking in flight (P-16).
  - [x] Blocks and the availability `kind` · AC-17, AC-18, AC-19, AC-20
    - Done: block create and release, the availability function with `kind`, the `room_blocked` pre check in `bookRoom` (`RoomCatalog.isBlocked`, a yes or no that never shows a block), the guard trigger as the backstop, and P-18 through the use cases (`createBlock` against `bookRoom`). The `GET /rooms/{id}/availability` endpoint itself belongs to feature 6; the data side of AC-20 is proven in `availability.test.ts`.
  - [x] Bookings list, metrics and insights · AC-10 to AC-14
    - Done: the bookings list (AC-10), `OperatorQueries` port, `listOperatorBookings`, `GET /operator/bookings` with filters and an opaque keyset cursor, upcoming run first then past. `from` and `to` bound `startsAt` as instants, `[from, to)`. Metrics: `GET /operator/metrics/rooms`, `companies`, `heatmap` and `insights` (AC-11 to AC-14). The database counts minutes per room and day in each facility's zone (`tstzmultirange`, blocks taken out of the open minutes); ratios, thresholds and insights are domain rules (`packages/domain/src/metrics`). Proven on a hand computed dataset in `packages/db/src/operator-metrics.test.ts`. Documented in `docs/api/operator.md` and the README Supuestos.
- [ ] Verify it: `/check verify operator administration`
- [x] Test it: `/test operator administration`. Must cover, as agreed on 2026-11-11:
  - `company.kind` (`company` or `individual`, immutable, default `company`) and `logo_url` (https only, 2048 max, `null` clears it)
  - creating a client creates its first member in the same transaction; an `individual` member name defaults to the client name; a second member of an `individual` is `individual_is_single` (409); a `company` accepts more members; another client never sees the person's bookings
  - `GET` and `POST /operator/companies/{id}/members`, and no way to create an operator through the API
  - company usage metric returns `kind` and filters by it
  - the operator login can insert into `app_user` (members only) and `facility`, `room`, `company`, `block`, but never `booking`, and has no `DELETE` (the widest permission change of the spec)
  - races P-16, P-17, P-18: book against deactivate, hours change and block
  - metrics on a known dataset: a room created mid range, a deactivated room, two zones, a blocked day leaving the denominator, a released block, an idle client, an empty range as `null`
    Spec 0004 · code in `packages/domain/`, `packages/application/`, `packages/db/`, `apps/web/`

### 9. Operator dashboard · in-progress, assumed decision (spec 0006)

The screen where the operator reads occupancy, ranks clients, and spots low utilization periods (heatmap), with a date range.
**Done when:** the operator sees the three metrics for a chosen range, idle clients and cells under 20% stand out, empty values show a dash, and a company user cannot open it.
- [ ] Design it (spec): assumed in [spec 0006](../../specs/_root/0006-operator-dashboard/index.md), `/architect operator dashboard` to ratify
- [x] Build it: `/develop operator dashboard`
  - [x] Daily occupancy query and `GET /metrics/daily` · AC-5
  - [x] Dashboard at `/operador` from the template, on the metric use cases · AC-1 to AC-4
- [ ] Verify it: `/check verify operator dashboard`
- [x] Test it: `/test operator dashboard`
  Spec 0006 · code in `packages/domain/src/metrics/dashboard.ts`, `packages/application/src/use-cases/operator-dashboard.ts`, `packages/db/src/operator-queries.ts`, `apps/web/src/app/(app)/operador/`

### 10. Operator global bookings view · in-progress

A filterable, paginated list of every booking with its company, for the operator only.
**Done when:** the operator filters by company, room and dates and pages through results; company users get 403.
- [x] Design it (spec): decided in spec 0001
- [x] Build it: `/operador/reservas`, the sede activity screen (spec 0007) over every sede: the period in cards (hours, mean length, bookings done, upcoming, cancelled and the rate, the busiest room), the next bookings, the history filtered by client, state and text, the weekly pattern and a calendar of every sede
- [ ] Verify it: `/check verify operator global bookings view`
- [ ] Test it: `/test operator global bookings view`
  The API side is built in feature 15 (spec 0004, `GET /operator/bookings`). The screen reads one period (7, 30 or 90 days) and at most 500 bookings of it, filtered in the browser; the room and date filters of the API are not on the screen. Spec 0001 · code in `apps/web/src/app/(app)/operador/reservas/`, `packages/application/src/use-cases/client-activity.ts`

### 16. Operator administration screens: sedes, rooms, clients, blocks · in-progress

The screens over feature 15: `/operador/sedes` and `/operador/clientes` with create, edit and deactivate, a sede's page with its rooms, its activity and the Bloqueos tab (week calendar plus table), and the list of bookings in the way of a block or a change in its own dialog.
**Done when:** the operator creates, edits and deactivates sedes, rooms and clients, blocks and releases time, sees the bookings that stop a change, and a member cannot open these pages.
- [x] Design it (spec): [spec 0005](../../specs/_root/0005-operator-administration-screens/index.md)
- [x] Build it: sedes and clientes screens, sede activity, blocks on the week calendar, the conflicts dialog
- [ ] Verify it: `/check verify operator administration screens`
- [x] Test it: `e2e/operator.spec.ts`, `e2e/conflicts.spec.ts`
  Spec 0005 · code in `apps/web/src/app/(app)/operador/sedes/`, `apps/web/src/app/(app)/operador/clientes/`

### 17. Client detail: activity, metrics and calendar · in-progress, assumed decision (spec 0007)

One client's page for the operator: its bookings, hours and cancellations over a period, compared with the period before, and its calendar.
**Done when:** the operator opens a client and reads its metrics and calendar for a chosen period; a member cannot open it.
- [ ] Design it (spec): assumed in [spec 0007](../../specs/_root/0007-client-detail-activity/index.md), `/architect client detail` to ratify
- [x] Build it: `/operador/clientes/[id]` on the client activity use case
  Spec 0007 · code in `apps/web/src/app/(app)/operador/clientes/[id]/`, `packages/application/src/use-cases/client-activity.ts`

## Delivery

### 11. End to end suite with accessibility checks · in-progress

Playwright flows against the built app: book, see the overlap reason from a second company, cancel and rebook, operator metrics, with axe checks on each screen.
**Done when:** the suite passes in `pnpm check:ai`, and no axe violations remain on the booking, availability and operator screens.
- [x] Build it: `/develop end to end suite`
- [ ] Verify it: `/check verify end to end suite`

### 12. README, assumptions and AI usage · done

The README the brief requires: run and test instructions, the architecture summary, the assumptions list ("Supuestos"), known limits, next version improvements, and the AI use section built from `docs/ai-usage.md`.
**Done when:** a stranger can run and test the project from the README alone, every open business rule is listed as an assumption, and the AI section names the tools, the delegated tasks and what was corrected or discarded.
- [x] Write it: `/document readme`

## Deferred

Out of scope for this build pass, kept so the plan stays honest. All are also listed in spec 0001 for the README "next version" section.
- **Idempotency keys** (Postgres backed): for retrying external clients · needs a decision
- **Separate Hono service, admin app, PgBouncer, Valkey**: only when a second client or real scale appears · needs a decision
- **Cancellation window and per room opening hours**: extra business rules (per facility hours are now in spec 0004) · needs a decision
- **Holiday calendar**: facilities, closures and blocks are in feature 15 (spec 0004); an automatic or recurring calendar stays here · needs a decision
- ~~**Rule based insights list**~~ moved into feature 15 (the `insights` endpoint of spec 0004)
- **Subject per booking, "solo las mías" filter, busy times in the booking form** (from spec 0003): next version ideas for the README; the grid of feature 6 covers busy times · needs a decision
- **Data model hardening** (no new entity, one migration): composite FK `booking(booked_by, tenant_id)` to `app_user(id, tenant_id)` so a booking's author always belongs to its company; composite FK `block(room_id, facility_id)` to `room(id, facility_id)` (today only `createBlock` checks it, and a mismatched row would silently block nothing, because the guard trigger and `room_busy_intervals` join on the facility); `CHECK (capacity > 0)` on `room`; `CHECK (deactivated_at >= active_from)` on `room`; `booking.cancelled_by`; a `block_kind` enum (maintenance, holiday, private event) next to the free text `reason` so metrics can tell them apart · needs a decision
- **Data model growth, commercial** (the brief's promotions and occupancy goals): `room_rate` (price per hour per room, valid from and to) plus a price snapshot on `booking` (`price_cents`, `currency`) for revenue metrics; `promotion` (discount, valid range, weekdays and hours, so it can target the heatmap's low cells) with `promotion_company` and `booking.promotion_id`, to measure whether an insight turned into bookings; `booking.attendees` for a capacity fit metric (a 16 seat room booked for 2); `booking.checked_in_at` or a `no_show` status for real use against booked use · needs a decision
- **Data model growth, operations**: `facility_hours` (one row per weekday and interval, replaces `opens_at`, `closes_at`, `open_weekdays`); `facility_closure` or `block_recurrence` (holidays, every Friday); `booking_series` with `booking.series_id` (weekly meetings); `amenity` and `room_amenity` (projector, video call, search by equipment); `company_plan` (monthly included hours, per company limits); `audit_event` (actor, entity, action, before, after, at; already in spec 0004 follow-up); `outbox_event` for notifications and a `waitlist_entry` that is told when a cancelled slot frees; `idempotency_key` (above); `membership` and a `company_admin` role with `invitation` (spec 0004 follow-up) · needs a decision
- **Data model growth, only at real scale**: stored `room_daily_usage` snapshots (measure first, spec 0004); an `organization` above `facility` if the product becomes a SaaS for several operators (a second tenancy level, the most expensive change on this list) · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. A ticked box with "decided in spec 0001" means that spec already covers the feature; a feature marked `needs a decision` still owes `/architect` for its screens.

**Feature lifecycle**: `planned` → `in-progress` → `done`, plus `existing` (predates the workflow) and `dropped`.

- **Next step** = the first unticked box.
- **Phase** = Foundation, then Slices in thread order, then Delivery.
- **Atomic build tasks live in the spec's `## Build plan`**, or are derived by `/develop` from spec 0001, not listed here.
- **Workflow** is the project default (Beta). No feature carries its own tier tag.
