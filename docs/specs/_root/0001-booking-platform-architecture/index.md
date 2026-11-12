# 0001. Booking platform architecture: one Next.js app, database enforced rules, typed results

**Date**: 2026-11-11
**Status**: Accepted

## Summary

The whole product stays in one Next.js app built with ports and adapters. The database, not the app code, guarantees that two bookings never overlap and that one company never sees another company's data. Every use case returns a typed result with a reason code. The web screens and a documented `/api/v1` both read that same result, so a failure always explains itself. A separate Hono service, Valkey, a second admin app and idempotency keys are deferred to the README "next version" list.

## Decision

**Chosen option**: Option 1, a single Next.js app on the existing ports and adapters layout.

**Implementation skills**: `architecture-boundaries` (local, `.claude/skills/architecture-boundaries/`) · `use-case-recipe` (local, `.claude/skills/use-case-recipe/`) · `multi-tenant-safety` (local, `.claude/skills/multi-tenant-safety/`) · `bff-edges` (local, `.claude/skills/bff-edges/`) · `nextjs-server-client` (local, `.claude/skills/nextjs-server-client/`) · `pattern-catalog` (local, `.claude/skills/pattern-catalog/`) · `calendar` (local, `.claude/skills/calendar/`, for the date picker and availability grid)

Decisions taken, each detailed below:

1. **One deployable.** `apps/web` serves company pages, operator pages, Server Actions and Route Handlers under `/api/v1`. No Hono service, no `apps/admin`, no Valkey, no PgBouncer.
2. **Overlap guard in the database.** An exclusion constraint on room and time range. The `23P01` error becomes the `conflict` result.
3. **Database roles, not services.** The app login `espacios_app` (member of `espacios_runtime`, RLS applies), a `BYPASSRLS` operator login (read only on tenant data; it may write catalog data since spec 0004), and a non superuser schema owner for migrations and seeds. `FORCE ROW LEVEL SECURITY` is on, so it really applies to the owner too.
4. **Typed results end to end.** One reason code per failure, mapped once to an HTTP status and once to a Spanish (es-AR) message.
5. **Idempotency deferred.** A double click guard in the UI plus a rule that a repeat of the exact same booking by the same company returns the existing booking. No keys table.
6. **Company identity** by seeded users and a signed cookie picker. The server resolves the company from the cookie, never from client input.
7. **Names follow the repo.** The table stays `company` (TEXT id and `slug`), and the tenant column stays `tenant_id`.

## Proposed stack

| Layer             | Choice                                                                                                  | Reason                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Application shape | Modular monolith, ports and adapters (ADR 0002)                                                         | Already enforced by dependency cruiser; one process runs from the README.                 |
| Web and API       | Next.js 16: Server Actions for the UI, Route Handlers at `/api/v1` for the documented API               | The brief grades API design; both share the same use cases and result type.               |
| Language          | TypeScript 6 on Node 24                                                                                 | Already in place (ADR 0004).                                                              |
| Primary database  | PostgreSQL 17 with Prisma 7; constraints, policies, roles grants and functions as raw SQL in migrations | Exclusion constraints and row level security are Postgres features Prisma does not model. |
| Tenant isolation  | Row level security with `FORCE`, plus a tenant filter in every repository                               | Two barriers (ADR 0003, pattern "Tenant isolation twice").                                |
| Operator reads    | Separate port on a dedicated `BYPASSRLS` login, read only on tenant data (catalog writes added by spec 0004)                                                | Smallest privilege that still sees all companies.                                         |
| Identity          | Seeded users, HMAC signed httpOnly cookie, picker screen                                                | The brief asks for no full authentication, yet a server side identity is still needed.    |
| Cache             | None                                                                                                    | Three rooms; availability must be real time.                                              |
| Messages          | next-intl catalog, es-AR                                                                                | Already in the stack.                                                                     |

## Feature design

### Database roles and connections

The repo today has `espacios_app` (login, in role `espacios_runtime`) and `espacios`, the docker superuser used as owner. That owner is a superuser, and superusers bypass RLS even with `FORCE`. So this spec changes the owner.

| Role                                 | Used by                                                                              | Privileges                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `espacios` (docker superuser)        | Infra init SQL and the test `global-setup.ts` only                                   | Creates the roles below. Never used by the app, migrations or seeds.                                                                                           |
| `espacios_owner`                     | `DATABASE_OWNER_URL`: `pnpm db:deploy`, `pnpm db:seed`, Prisma Studio                | Non superuser, `LOGIN CREATEDB` (Prisma's shadow database needs it). Owns the tables. `FORCE` applies to it, so seeds and fixtures set the tenant per company. |
| `espacios_app` in `espacios_runtime` | `DATABASE_URL`: company edge (`UnitOfWork`)                                          | `SELECT`, `INSERT`, `UPDATE` on `bookings`; `SELECT` on `room`, `company`, `app_user`. Owns nothing. RLS applies.                                              |
| `espacios_operator`                  | `DATABASE_OPERATOR_URL`: operator query port and the availability port for operators | `LOGIN BYPASSRLS`, `SELECT` on `bookings`, `room`, `company`, `app_user`, and `EXECUTE` on the availability function. No writes on tenant data; amended by spec 0004: it may also write `facility`, `room`, `company`, `block` and insert members, never `booking`.                          |
| `espacios_availability`              | Owner of the availability function                                                   | `NOLOGIN BYPASSRLS`, `USAGE` on the schema, `SELECT` on `bookings (room_id, starts_at, ends_at, status)` (column grant).                                       |

- **Where roles are created:** cluster wide roles with `BYPASSRLS` need a superuser, and Prisma's shadow database replays migrations in the same cluster, so `CREATE ROLE` cannot live in a migration. They go in `infra/local/postgres/` init SQL and in `global-setup.ts`. Migrations only `GRANT`, and set `ALTER DEFAULT PRIVILEGES` for new tables. Existing docker volumes run init scripts once, so the README tells people to run `docker compose down -v` after pulling this change.
- **Function ownership:** init SQL makes `espacios_owner` a member of `espacios_availability` so a migration run by the owner can `ALTER FUNCTION ... OWNER TO espacios_availability`, and gives that role `CREATE` on the schema for the change.
- **Prisma Studio** on the owner login shows only the current tenant's rows, so by default it shows no bookings. To browse every company, point Studio at `DATABASE_OPERATOR_URL` (read only). The README says so.
- **Wiring:** the operator login is created only in `apps/web/src/composition`. The company edge can never import the operator port (dependency cruiser rule).

### Data model (confirmed, with repo names)

All ids are TEXT generated through the existing ids port, as in the current `company` table.

| Entity             | Fields                                                                                                                                                                                         | Rules                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `company` (exists) | `id` PK, `name`, `slug` unique, `created_at`                                                                                                                                                   | The tenant. No RLS. Read only for the runtime role.        |
| `app_user`         | `id` PK, `tenant_id` FK nullable, `name`, `role` (`member` or `operator`), `created_at`                                                                                                        | Seeded. No RLS (user names are not private, see Security). |
| `room`             | `id` PK, `name` unique, `capacity` int, `created_at`                                                                                                                                           | Operator owned and shared. No `tenant_id`, no RLS.         |
| `bookings`         | `id` PK, `tenant_id` FK, `room_id` FK, `booked_by` FK `app_user`, `starts_at` timestamptz, `ends_at` timestamptz, `status` (`confirmed` or `cancelled`), `cancelled_at` nullable, `created_at` | RLS and `FORCE` on `tenant_id`.                            |

(`app_user` avoids the reserved word `user`. The repo's `company` table is singular, so the migration may name `bookings` and `room` in the same style. Pick one style when writing the migration and keep it everywhere; the names above are the spec's working names.)

Constraints and indexes:

- `app_user`: `CHECK ((role = 'member') = (tenant_id IS NOT NULL))`. A member has a company, an operator has none.
- `bookings`: `CHECK (ends_at > starts_at)`, and `CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))`.
- `bookings`: `EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed')`. It needs the `btree_gist` extension, declared in the migration. The range is half open, so 14:00 to 15:00 and 15:00 to 16:00 do not overlap. Constraint checks ignore RLS, so overlaps across companies are caught.
- Indexes: `(tenant_id, starts_at, id)` for own lists, `(room_id, starts_at)` for availability and metrics.
- Policy on `bookings`: `USING` and `WITH CHECK` on `tenant_id = (SELECT current_tenant_id())`. The function returns `NULLIF(current_setting('app.tenant_id', true), '')`, declared `STABLE`. An empty setting gives `NULL`, so no rows match (fails closed). Wrapping the call in `(SELECT ...)` lets the planner evaluate it once per query (an init plan) instead of per row.
- Prisma cannot model the constraint, policies, `FORCE` or functions. Migrations are created with `prisma migrate dev --create-only` and the SQL is appended by hand. A drift check (`prisma migrate diff --from-migrations ... --to-schema ...` is empty) runs in the test gate.

Opening hours are a constant in `packages/domain`, not a table.

### Booking rules (assumptions for the README "Supuestos")

| Rule            | Value                                                                                                                                                                                                                               | Failure reason                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Time zone       | One facility zone, `America/Argentina/Buenos_Aires`. Stored as UTC `timestamptz`, validated and shown in that zone. Zone math in `domain` uses `Intl.DateTimeFormat` only (no library), with a fixed IANA name, not a fixed offset. | n/a                                       |
| Input format    | The API requires RFC 3339 with an offset. The form sends date plus `HH:mm` and the server builds the instant in the facility zone. Output is ISO with `-03:00`.                                                                     | `invalid_input`                           |
| Grid            | Start and end on 30 minute marks.                                                                                                                                                                                                   | `not_on_grid`                             |
| Opening hours   | Monday to Friday, 08:00 to 20:00 local. The booking must fit inside. Holidays are ignored (a limitation).                                                                                                                           | `outside_hours`                           |
| Same day        | Start and end fall on the same local day.                                                                                                                                                                                           | `invalid_range`                           |
| Length          | Minimum 30 minutes, maximum 4 hours.                                                                                                                                                                                                | `too_short`, `too_long`                   |
| Order           | `ends_at` after `starts_at`.                                                                                                                                                                                                        | `invalid_range`                           |
| Not in the past | `starts_at` must be in the future (clock port).                                                                                                                                                                                     | `past_date`                               |
| Horizon         | At most 60 days ahead.                                                                                                                                                                                                              | `beyond_horizon`                          |
| Who cancels     | Any member of the booking's company. `booked_by` is kept for display and audit.                                                                                                                                                     | `not_found` for other companies           |
| Cancellation    | Allowed any time before `starts_at`. After it starts: refused. Already cancelled: refused.                                                                                                                                          | `cancel_not_allowed`, `already_cancelled` |
| Overlap         | No two `confirmed` bookings of the same room overlap, across all companies.                                                                                                                                                         | `conflict`                                |
| Facilities      | One facility and one zone in v1. More facilities would add a facility entity (a limitation).                                                                                                                                        | n/a                                       |

### Typed result and error contract

Every use case returns `{ ok: true, value, message }` or `{ ok: false, reason, message }`. Only a thrown error rolls a transaction back, so every refusal is returned before any write (see `packages/application/AGENTS.md`). The brief asks the user to know the result of each operation, so successes carry a message too: "Reserva confirmada" and "Reserva cancelada" (catalog keys under `success.*`).

| Reason                                                                                                                        | HTTP                      | Meaning shown to the user (es-AR key under `errors.*`)                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_input`                                                                                                               | 400                       | Malformed request (Zod), including a time without an offset.                                                                            |
| `not_on_grid`, `outside_hours`, `invalid_range`, `too_short`, `too_long`, `past_date`, `beyond_horizon`, `cancel_not_allowed` | 422                       | The specific rule that failed. `invalid_range` also covers metrics ranges where `from` is after `to` or the span exceeds 366 days.      |
| `conflict`                                                                                                                    | 409                       | The room was just booked for that time. Pick another slot.                                                                              |
| `already_cancelled`                                                                                                           | 409                       | This booking was already cancelled.                                                                                                     |
| `not_found`                                                                                                                   | 404                       | Also covers "not yours" (RLS hides it) and an unknown room, so existence is never confirmed.                                            |
| `unauthenticated`                                                                                                             | 401                       | No valid session cookie, or the user in the cookie no longer exists.                                                                    |
| `forbidden`                                                                                                                   | 403                       | A member calls an operator endpoint, or an operator calls a member endpoint.                                                            |
| `busy`                                                                                                                        | 503 with `Retry-After: 1` | Lock timeout, statement timeout, deadlock, serialization failure, or Prisma `P2028` (transaction timeout or no free connection). Retry. |

- One function `reasonToHttp(reason)` maps reason to status. One catalog key per reason gives the message. A test iterates every reason (nothing unmapped).
- JSON body for the API: `{ "code": "<reason>", "message": "<es-AR text>" }`. RFC 9457 is a possible later change, not v1.
- **Never forward a raw driver error or the conflicting booking's details** (company, user, times). The `conflict` text is fixed.
- **SQLSTATE through Prisma.** With Prisma 7 and `adapter-pg`, driver errors arrive wrapped (`DriverAdapterError`, code in `cause` or `meta`), not as `err.code`. One helper `sqlState(err)` in `packages/db` unwraps it. Mapping happens outside `$transaction`, because the PostgreSQL transaction is already aborted. `23P01` becomes `ConcurrencyError` then `conflict`. `55P03`, `57014`, `40P01`, `40001` and `P2028` become `busy`.
- Inside each tenant transaction the adapter sets `SET LOCAL lock_timeout = '3s'` and `statement_timeout = '5s'`.

### API surface

Cookie session on every route. Server Actions for the UI call the same use cases as these handlers.

| Endpoint                             | Method | Key inputs                                                                                       | Key outputs                                                                                       | Who                | Key errors                   |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- |
| `/api/v1/rooms`                      | GET    | none                                                                                             | rooms (id, name, capacity)                                                                        | any signed in user | 401                          |
| `/api/v1/rooms/{id}/availability`    | GET    | `date` (local day, `YYYY-MM-DD`)                                                                 | open hours (or closed), busy intervals (start, end, `mine`), free slots                           | member, operator   | 400, 401, 404                |
| `/api/v1/bookings`                   | POST   | `roomId`, `startsAt`, `endsAt`                                                                   | booking; 201 with `Location` when new, 200 when the same company already holds that exact booking | member             | 400, 401, 403, 409, 422, 503 |
| `/api/v1/bookings`                   | GET    | `status` (`confirmed`, `cancelled`, `all`, default `confirmed`), `from`, `to`, `cursor`, `limit` | own bookings, upcoming first, with `nextCursor`                                                   | member             | 400, 401, 403                |
| `/api/v1/bookings/{id}/cancel`       | POST   | none                                                                                             | cancelled booking                                                                                 | member             | 401, 403, 404, 409, 422      |
| `/api/v1/operator/bookings`          | GET    | `tenantId`, `roomId`, `from`, `to`, `cursor`, `limit`                                            | all bookings with company names                                                                   | operator           | 401, 403                     |
| `/api/v1/operator/metrics/rooms`     | GET    | `from`, `to` (inclusive local days)                                                              | occupancy per room and overall                                                                    | operator           | 401, 403, 422                |
| `/api/v1/operator/metrics/companies` | GET    | `from`, `to`                                                                                     | usage per company                                                                                 | operator           | 401, 403, 422                |
| `/api/v1/operator/metrics/heatmap`   | GET    | `from`, `to`, optional `roomId`                                                                  | weekday by hour occupancy                                                                         | operator           | 401, 403, 422                |

- **Extended by [spec 0003](../0003-booking-form-my-bookings/index.md):** the member list `GET /api/v1/bookings` takes `view` (`upcoming`, `past`, `cancelled`) in place of `status`, `from` and `to`, and the booking view adds `phase` and `createdAt`.
- **Booking view** (the same DTO everywhere): `id`, `room` (id, name), `startsAt`, `endsAt`, `status`, `bookedBy` (name), `cancelledAt`. The operator view adds the company name. A company never receives another company's name or booking id.
- **Pagination:** keyset on `(starts_at, id)`, opaque base64 cursor, `limit` default 50, maximum 100, upcoming first.
- Server Actions: `signInAs(userId)`, `bookRoom`, `cancelBooking`. The booking form uses `useActionState` and disables submit while pending (double click guard).

### Booking and cancel flows

- **Create.** Validate (domain rules, no database), then in one tenant transaction run `INSERT ... ON CONFLICT DO NOTHING RETURNING id`. It works with exclusion constraints and waits for any in flight conflicting transaction. If a row returns: success (201). If none returns: look up, under RLS, a `confirmed` booking of this company for the same room and exact range. Found: return it (200). Not found: another company (or a different range) holds the slot, so return `conflict`. There is no separate "friendly" pre check: the `conflict` text is fixed, and an RLS scoped pre check cannot see other companies anyway.
- **Cancel.** One statement: `UPDATE bookings SET status = 'cancelled', cancelled_at = now WHERE id = $1 AND status = 'confirmed' AND starts_at > now RETURNING ...`. Zero rows: read the booking once (RLS scoped) to pick `not_found`, `already_cancelled` or `cancel_not_allowed`. This keeps a cancel racing a cancel or a start safe.

### Value sourcing

| Action             | Value                                                           | Source                                                                                                              |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Any company action | current company id                                              | `app_user.tenant_id` of the user in the signed cookie, resolved server side. Never from the request body or header. |
| Book               | `booked_by`                                                     | user id from the signed cookie                                                                                      |
| Book               | `status`, `created_at`, ids                                     | `confirmed`; clock port; ids port                                                                                   |
| Book, cancel       | "now" for the past and horizon checks, `cancelled_at`           | clock port (injected, testable)                                                                                     |
| Book               | opening hours, grid, min and max length, horizon, facility zone | constants in `packages/domain`                                                                                      |
| Book (form)        | `startsAt`, `endsAt` instants                                   | form date plus `HH:mm`, built server side in the facility zone                                                      |
| Book               | 200 for the exact same booking                                  | the `ON CONFLICT` miss plus an RLS scoped lookup (above)                                                            |
| Availability       | busy intervals                                                  | `room_busy_intervals(room_id, from, to)` (below)                                                                    |
| Availability       | `mine` flag                                                     | the edge merges the caller's own bookings list into the busy intervals                                              |
| Availability       | free slots                                                      | a `domain` function: opening hours minus busy intervals minus the past                                              |
| Availability       | 404                                                             | a separate room existence check in the use case (the function returns an empty set for an unknown room)             |
| Metrics            | open minutes per room                                           | `domain` TypeScript: weekdays in the range × 720 minutes. Not computed in SQL.                                      |
| Metrics            | booked minutes                                                  | SQL sum over `confirmed` bookings with `starts_at` in the range                                                     |
| Metrics            | range                                                           | `from` and `to` inclusive local days, default last 30 days ending today, maximum 366 days                           |
| Session            | cookie value                                                    | `userId.expiresAt.signature`, HMAC with `SESSION_SECRET` (`expiresAt` in unix seconds)                              |
| Seeds              | rooms, companies, users, demo bookings                          | `pnpm db:seed` (below)                                                                                              |

### Availability read path

RLS hides other companies' bookings, so a company could not see that a room is taken. The function `room_busy_intervals(room_id, from, to)` returns `starts_at` and `ends_at` of `confirmed` bookings only: no company, no user, no booking id.

- `SECURITY DEFINER`, owned by `espacios_availability` (a `BYPASSRLS` role, so `FORCE` does not filter it by the caller's company). Body references only the four granted columns.
- `SET search_path = pg_catalog, pg_temp`, table written as `public.bookings`, `REVOKE EXECUTE` from `PUBLIC`, `EXECUTE` granted to `espacios_runtime` and `espacios_operator`.
- The query uses `tstzrange(starts_at, ends_at, '[)') && tstzrange($from, $to)` and `status = 'confirmed'`, so the constraint's gist index is used. The span is capped by the caller (one day in v1).
- Companies reach it through the tenant transaction. Operators reach it through an `AvailabilityQuery` port on the operator connection (a `UnitOfWork` requires a tenant, which operators do not have).
- Availability is never cached.

### Metrics (definitions)

All computed by the operator port over `confirmed` bookings whose `starts_at` is inside the range (local days, `[from 00:00, to + 1 day 00:00)`, using `AT TIME ZONE 'America/Argentina/Buenos_Aires'`, not a fixed offset). Bookings are always same day and inside opening hours, so no clipping is needed. Cancelled bookings never count as used time.

- **Occupancy per room** = booked minutes divided by open minutes (weekdays in the range × 720 × 1 room). Overall occupancy = total booked minutes divided by open minutes of all current rooms. Scheduled future bookings inside the range count.
- **Usage per company**: booked hours, bookings count, cancelled count, cancellation rate (`cancelled / (confirmed + cancelled)` for bookings starting in the range), share of all booked hours. Companies are `LEFT JOIN`ed, so a company with no bookings still appears (the idle clients that are promotion candidates). Sorted by booked hours.
- **Heatmap**: for each weekday (Monday to Friday) and each hour 08 to 19, occupancy = booked minutes inside that hour cell divided by (60 × rooms × number of that weekday in the range). A booking such as 10:30 to 12:00 is split across hour cells (`generate_series` of hour buckets intersected with the booking range), not assigned by its start hour. All current rooms count, regardless of `created_at`. Cells under 20% flag low utilization.
- **Empty cases:** when a denominator is zero (no weekdays in the range, no rooms, no bookings), the value is `null` and the UI shows a dash, never 0%.
- Holidays are ignored in open minutes (a limitation).

### Seeds

`pnpm db:seed` runs through `DATABASE_OWNER_URL`. It is idempotent (fixed ids and `ON CONFLICT DO NOTHING`; running it twice adds nothing). It creates 3 rooms with names and capacities, 3 companies, 1 or 2 users per company, one operator, and about 40 demo bookings across the previous and next weeks, including a few cancelled ones, so the metric screens are meaningful on first run. Because `FORCE` applies to the owner, it sets `app.tenant_id` with `set_config` for each company before inserting that company's bookings.

### Key invariants

- Two `confirmed` bookings of one room never overlap, enforced by the exclusion constraint, even under concurrency.
- A company transaction can only read or write `bookings` rows of its own company (RLS with `WITH CHECK`, plus the repository filter).
- A returned failure leaves nothing written.
- `room` is shared and read only for companies.
- Only the operator port crosses companies, and only for reads. Only the availability function exposes other companies' data, and only start and end times.

### Patterns (from `pattern-catalog`)

- Two writes in one action: none (one table per action). Skipped.
- Tenant data: "Tenant isolation twice". Proof: `database-guarantees.test.ts` as `espacios_app`.
- Same room and time at once: "Overlap guarded by the database". Proof: concurrency test P-1.
- Second kind of client: "Backends for frontends", the company edge and the operator edge in one app.
- Write that must not repeat: "Idempotent write", light form only (UI guard and the exact repeat returns 200). Full keys deferred; would change if an external client retries.
- Cache, outside call, outbox: none needed. Skipped.

### Security model

- Company users read and write only their own bookings; they read all rooms and the anonymous busy intervals.
- The operator reads everything and writes no tenant data (amended by spec 0004: it administers the catalog), through the operator ports. Operator pages are guarded by role in the edge and by the read only database role.
- **Names are not private.** `company` and `app_user` have no RLS, because the picker and the cookie resolve a user before any tenant is set. A member can therefore list other companies' user names. Seed names are demo data. State this in Supuestos.
- Cookie: httpOnly, `SameSite=Lax`, `Secure` when the request protocol is https (not keyed on `NODE_ENV`, so `next start` over http still works), HMAC signed with a timing safe compare, `maxAge` 8 hours. The signed value carries the same expiry, so a copied cookie is refused after it (401) even though only the browser enforces `maxAge`. If the user in the cookie no longer exists, respond 401.
- CSRF: `SameSite=Lax` treats other `localhost` ports as same site, so the Origin check is the real guard. Reject a state changing request when `Origin` is present and does not match the request host; allow it when absent (curl). POST Route Handlers also require `Content-Type: application/json`. Server Actions use Next.js origin checks.
- This is a stand in for authentication, not authentication: anyone can pick any seeded user. State it in the README limits.
- Raw database errors, stack traces and other companies' data never reach a response.

### Configuration required

- `DATABASE_URL`: `espacios_app` login (company edge). Exists.
- `DATABASE_OWNER_URL`: now the non superuser `espacios_owner` (migrations, seed, Studio). Exists, value changes.
- `DATABASE_OPERATOR_URL`: `espacios_operator` login (operator port). New.
- `SESSION_SECRET`: key for the cookie HMAC, at least 32 random bytes. New.
- Update `.env.example`, `compose.yaml` init scripts and `packages/db/AGENTS.md` (it still sends operator reads through the owner connection).

### Required proofs (each must exist before the slice is called done)

- **P-1** Concurrency: N parallel inserts of one room and range from different companies, against real Postgres as `espacios_app`. Exactly one succeeds, N minus 1 return `conflict`, and the error carries no other company's data. Keep N at or under the pool size, or raise `maxWait`.
- **P-2** Partial overlap (10 to 12 against 11 to 13) is refused. Adjacent (10 to 11 and 11 to 12) is allowed. Cancel then rebook the same slot succeeds.
- **P-3** RLS isolation as a non superuser (the testcontainers default user is a superuser and would pass falsely), and with the owner role too, since `FORCE` is on: company A cannot read, update or cancel company B's booking; B's booking id returns `not_found`; an empty tenant setting returns no rows; `WITH CHECK` blocks inserting another company's id.
- **P-4** Availability shows busy intervals of other companies with no company or user fields, and marks the caller's own as `mine`. Unknown room is 404.
- **P-5** Operator role: reads all companies, any `INSERT`, `UPDATE` or `DELETE` fails.
- **P-6** Mapper test iterates every reason code: each has an HTTP status and a catalog message, no extras.
- **P-7** Every booking rule has a domain unit test, including the 30 minute grid, opening hours, `Intl` zone conversion (a test fixes the assumption that Buenos Aires has no daylight saving time now) and the 60 day horizon.
- **P-8** Metrics queries on a seeded dataset with known occupancy, per room, per company and heatmap, including a cancelled booking that must not count, a booking that spans hour cells, a company with no bookings, and empty ranges returning `null`.
- **P-9** Lock timeout returns `busy` (503) and nothing is written. Reproduced by holding an uncommitted conflicting insert in another transaction. The `sqlState(err)` helper is proven with real `23P01`, `55P03` and `57014` errors coming out of Prisma.
- **P-10** e2e: book, see the overlap reason from a second company, cancel, slot becomes free, operator sees the metrics.
- **P-11** Double submit race: two identical simultaneous requests from one company give one 201 and one 200 (same booking). The same request from a different company gives `conflict`.
- **P-12** Cancel race: two simultaneous cancels give one success and one `already_cancelled`; a cancel after start gives `cancel_not_allowed`.
- **P-13** Seed runs twice without duplicates, and works under `FORCE`.
- **P-14** Cookie: bad signature, expired, unknown user (401), mismatched `Origin` (rejected), absent `Origin` (allowed), `Secure` only over https.
- **P-15** Drift check: `prisma migrate diff` between migrations and the schema is empty.

## Consequences

**Positive**:
- One process to install and run; the README is short and the "runs locally" requirement is safe.
- The two critical guarantees live in Postgres, so a coding mistake cannot break them.
- One result type feeds the UI, the REST API and the tests; messages cannot drift from status codes.
- The operator can no longer write by mistake, because the role cannot.
- `FORCE` makes isolation true for the owner login too, which makes the demo honest.

**Negative / tradeoffs**:
- No typed RPC client and no runtime portability, which the Hono plan offered. They matter only when a second client appears.
- Exclusion constraints, policies, roles and the availability function are raw SQL, so Prisma cannot describe them and they need their own tests and a drift check.
- Roles live outside migrations, so existing docker volumes need `docker compose down -v` once.
- Prisma Studio on the owner login shows no bookings by default, because `FORCE` applies. It must be pointed at the operator login to see everything.
- Without idempotency keys, a retry that differs from the original in any way can show `conflict` for a booking that succeeded. The exact repeat rule covers the common case only.
- The cookie picker is not authentication, and user names are visible to every member.
- Holidays and several facilities are not modelled.

**Neutral**:
- ADR 0003 needs an amendment (non superuser owner, operator role, `FORCE`, availability function).
- The pattern catalog entries "Overlap guarded by the database" and "Idempotent write" are updated by this change.

## Follow-up

- [ ] Amend ADR 0003: replace the owner served operator reads with `espacios_operator` (`BYPASSRLS`, read only), make the owner a non superuser, add `FORCE`, add the availability function owner role and where roles are created. Then set ADRs 0001 to 0004 to `accepted` where confirmed.
- [ ] Update `packages/db/AGENTS.md` (operator reads no longer use the owner connection), `.env.example`, `compose.yaml` and `infra/local/postgres/` init SQL.
- [ ] README "Supuestos": copy the booking rules table, the metrics definitions, the time zone choice, "who cancels", "user names are not private" and "the picker is not authentication".
- [ ] README "Limitaciones": holidays ignored, one facility and one zone, no real authentication.
- [ ] README "Mejoras para una próxima versión": Hono service (typed RPC, second client), idempotency keys with a Postgres store, Valkey for shared cache, a separate admin app, PgBouncer, capability flags, per room opening hours, a cancellation window, RFC 9457 error bodies.
- [ ] Correct the "4ms vs 1840ms" claim before quoting it: the gain comes from wrapping the policy call as `(SELECT current_tenant_id())`, not from `STABLE` alone. Benchmark it yourself.
- [ ] Run `/scope` to turn this into slices (Tracer Bullet: book one room and see it in the list, then availability, cancel, operator metrics).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
