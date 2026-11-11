# Scope: Alquiler de espacios

A web app where client companies see meeting room availability, book rooms and cancel their own bookings, and the operator sees how rooms and clients are used. Built for the Fontanella SRL challenge (brief in `docs/challenge.md`). Repo wide scope, because every feature crosses `packages/*` and `apps/web`.

**Build approach:** Tracer Bullet (one thin real thread through every layer first, a company books a room and sees it in its list, then each slice thickens one segment end to end).
**Workflow:** Beta (after develop, `/check verify` then `/test`). `/architect` is the recommended first stop for a feature with an open decision, skippable when the spec already covers it. Spec 0001 already decides the platform, roles, error contract, booking rules and metric definitions, so most features below start from it.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit. You decide when a feature is `done`._

## At a glance

| #   | Feature                                               | Phase      | Status      |
| --- | ----------------------------------------------------- | ---------- | ----------- |
| 1   | Repo foundation: tooling, layer packages, web shell   | Foundation | existing    |
| 2   | Database foundation: roles, FORCE RLS, schema, seeds  | Foundation | in-progress |
| 3   | Company identity: seeded users, signed cookie, picker | Foundation | planned     |
| 4   | Result and error contract                             | Foundation | planned     |
| 5   | Book a room and see it in my bookings                 | Slice 1    | planned     |
| 6   | Room availability grid                                | Slice 2    | planned     |
| 7   | Cancel a booking and free the slot                    | Slice 3    | planned     |
| 8   | Operator metrics: queries and API                     | Slice 4    | planned     |
| 9   | Operator dashboard                                    | Slice 4    | planned     |
| 10  | Operator global bookings view                         | Slice 4    | planned     |
| 11  | End to end suite with accessibility checks            | Delivery   | planned     |
| 12  | README, assumptions and AI usage                      | Delivery   | planned     |

## Foundations

### 1. Repo foundation: tooling, layer packages, web shell · existing

Monorepo, quality gates, hooks, `domain` / `application` / `db` packages, a database adapter skeleton and the web app shell. Predates this scope. code in `./`

### 2. Database foundation: roles, FORCE RLS, schema, seeds · in-progress

The ground every slice stands on: cluster roles in the infra init SQL and test global setup, a non superuser owner, the `bookings`, `room` and user tables, the exclusion constraint, row level security with `FORCE`, the availability function, grants, and `pnpm db:seed`. Also amends ADR 0003 and `packages/db/AGENTS.md`.
**Done when:** a migration run as the owner creates the schema, an integration test as `espacios_app` proves isolation and the overlap constraint, the seed runs twice without duplicates under `FORCE`, and the README notes `docker compose down -v`.
- [x] Design it (spec): decided in spec 0001
- [x] Build it: `/develop database foundation`
- [ ] Verify it: `/check verify database foundation`
- [ ] Test it: `/test database foundation`
  Spec 0001 · code in `packages/db/`, `infra/`

### 3. Company identity: seeded users, signed cookie, picker

A "sign in as" picker that sets an HMAC signed cookie; the server resolves the company from it, never from client input. Company and operator edges, 401 and 403 rules, Origin check.
**Done when:** picking a seeded user sets a signed cookie, a tampered or expired cookie gets 401, a member cannot reach operator routes (403), and the company id used by every action comes from the cookie.
- [x] Design it (spec): decided in spec 0001
- [ ] Build it: `/develop company identity`
- [ ] Verify it: `/check verify company identity`
- [ ] Test it: `/test company identity`
  Spec 0001 · code in `apps/web/`

### 4. Result and error contract

The typed `Result` with reason codes, `reasonToHttp`, the es-AR message catalog, the `sqlState(err)` helper and the `busy` mapping, so every later slice reports failures the same way.
**Done when:** every reason has one HTTP status and one Spanish message (a test iterates them), and a real `23P01`, `55P03` and `57014` coming out of Prisma map to `conflict` and `busy`.
- [x] Design it (spec): decided in spec 0001
- [ ] Build it: `/develop result and error contract`
- [ ] Verify it: `/check verify result and error contract`
- [ ] Test it: `/test result and error contract`
  Spec 0001 · code in `packages/application/`, `packages/db/`, `apps/web/`

## Slice 1: the thin thread

### 5. Book a room and see it in my bookings · needs a decision

The walking skeleton. A signed in company member picks a room, a date and a time, books it, and sees the booking in its own list. Real database, real rules (grid, hours, length, past, horizon), real overlap guard, real failure messages. Only the two screens (booking form, my bookings) still need a design.
**Done when:** a booking is stored and listed under its company; a second company booking the same room and time gets `conflict` with a clear message; each rule violation shows its own reason; N parallel requests for one slot give exactly one success; a double submit by the same company returns the existing booking.
- [ ] Design it (spec): `/architect booking form and my bookings screens`
  Spec 0001 covers the rules and API; the spec for this feature covers the two screens.

## Slice 2: availability

### 6. Room availability grid · needs a decision

A day view per room showing opening hours, other companies' busy intervals without any company detail, the caller's own bookings marked, and the free slots to pick.
**Done when:** a company sees that a room is taken without learning who holds it; closed days show no slots; an unknown room is 404; the operator can view it too through its own port.
- [ ] Design it (spec): `/architect room availability grid`
  Spec 0001 covers the function and the endpoint; the spec for this feature covers the screen.

## Slice 3: cancel

### 7. Cancel a booking and free the slot

A member cancels any booking of their company before it starts, and the slot is free again immediately.
**Done when:** cancel works only before the start, a second cancel returns `already_cancelled`, another company's booking is `not_found`, cancelling a started booking returns `cancel_not_allowed`, and a cancelled slot can be rebooked at once.
- [x] Design it (spec): decided in spec 0001
- [ ] Build it: `/develop cancel a booking`
- [ ] Verify it: `/check verify cancel a booking`
- [ ] Test it: `/test cancel a booking`
  Spec 0001 · code in `packages/domain/`, `packages/application/`, `packages/db/`, `apps/web/`

## Slice 4: operator view

### 8. Operator metrics: queries and API

Occupancy per room and overall, usage per company (hours, bookings, cancellations, share, idle companies) and the weekday by hour heatmap, all in SQL through the operator port, with the `/api/v1/operator/metrics/*` endpoints.
**Done when:** on a seeded dataset with known numbers each metric matches by hand, cancelled bookings never count, a booking spanning hour cells is split, empty ranges return `null`, and the operator login cannot write.
- [x] Design it (spec): decided in spec 0001
- [ ] Build it: `/develop operator metrics`
- [ ] Verify it: `/check verify operator metrics`
- [ ] Test it: `/test operator metrics`
  Spec 0001 · code in `packages/db/`, `packages/application/`, `packages/domain/`, `apps/web/`

### 9. Operator dashboard · needs a decision

The screen where the operator reads occupancy, ranks clients, and spots low utilization periods (heatmap), with a date range.
**Done when:** the operator sees the three metrics for a chosen range, idle clients and cells under 20% stand out, empty values show a dash, and a company user cannot open it.
- [ ] Design it (spec): `/architect operator dashboard`

### 10. Operator global bookings view

A filterable, paginated list of every booking with its company, for the operator only.
**Done when:** the operator filters by company, room and dates and pages through results; company users get 403.
- [x] Design it (spec): decided in spec 0001
- [ ] Build it: `/develop operator global bookings view`
- [ ] Verify it: `/check verify operator global bookings view`
- [ ] Test it: `/test operator global bookings view`
  Spec 0001 · code in `apps/web/`

## Delivery

### 11. End to end suite with accessibility checks

Playwright flows against the built app: book, see the overlap reason from a second company, cancel and rebook, operator metrics, with axe checks on each screen.
**Done when:** the suite passes in `pnpm check:ai`, and no axe violations remain on the booking, availability and operator screens.
- [ ] Build it: `/develop end to end suite`
- [ ] Verify it: `/check verify end to end suite`

### 12. README, assumptions and AI usage

The README the brief requires: run and test instructions, the architecture summary, the assumptions list ("Supuestos"), known limits, next version improvements, and the AI use section built from `docs/ai-usage.md`.
**Done when:** a stranger can run and test the project from the README alone, every open business rule is listed as an assumption, and the AI section names the tools, the delegated tasks and what was corrected or discarded.
- [ ] Write it: `/document readme`

## Deferred

Out of scope for this build pass, kept so the plan stays honest. All are also listed in spec 0001 for the README "next version" section.
- **Idempotency keys** (Postgres backed): for retrying external clients · needs a decision
- **Separate Hono service, admin app, PgBouncer, Valkey**: only when a second client or real scale appears · needs a decision
- **Cancellation window and per room opening hours**: extra business rules · needs a decision
- **Holidays and several facilities**: calendar and facility model · needs a decision
- **Rule based insights list** (idle clients, off peak hints): extra on top of the heatmap · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. A ticked box with "decided in spec 0001" means that spec already covers the feature; a feature marked `needs a decision` still owes `/architect` for its screens.

**Feature lifecycle**: `planned` → `in-progress` → `done`, plus `existing` (predates the workflow) and `dropped`.

- **Next step** = the first unticked box.
- **Phase** = Foundation, then Slices in thread order, then Delivery.
- **Atomic build tasks live in the spec's `## Build plan`**, or are derived by `/develop` from spec 0001, not listed here.
- **Workflow** is the project default (Beta). No feature carries its own tier tag.
