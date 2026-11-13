# 0001. Rationale: booking platform architecture

## Context

> ⚠️ Premise note: the first plan for this project was written for a product that needs several clients and several deployable services (a Hono service, a second admin app, PgBouncer, Valkey, capability flags). The brief asks for a first version in 72 hours, three rooms, a few companies, no cloud infrastructure and no production deploy, and it grades judgement as much as the result. Building the larger plan would multiply the processes to run and test, and would spend time on problems nobody has measured. This spec keeps the plan's sound ideas (database enforced rules, two privilege levels, a tenant in every cache key if a cache ever exists) and defers the rest.

This is a repo wide decision. The repo already has ports and adapters enforced by dependency cruiser, a Prisma adapter skeleton and one Next.js app. Four ADRs are still `proposed`.

The brief has three hard rules. A room is never booked twice for overlapping times, even when two companies submit at the same moment. A company never reads another company's private data, while the operator sees everything. Every failure explains itself. It also asks for metrics the operator can use, and says that rules left open must be decided and documented.

Three problems showed up when the first plan was compared with the brief:

- A unique index on `(room, date, slot)` only stops identical slots. A booking from 10:00 to 12:00 and another from 11:00 to 13:00 would both succeed.
- Row level security hides other companies' bookings, so a company could not see that a room is already taken. Rooms also belong to the operator, not to a company.
- The plan defined no metrics, no booking rules, and no way to represent a company without authentication.

## Options considered

### Option 1: One Next.js app, ports and adapters, database enforced rules (chosen)

Company edge and operator edge are two sets of routes in `apps/web`, backed by two ports and two database logins. Server Actions serve the UI, Route Handlers at `/api/v1` serve the documented API, both call the same use cases.

**Pros**:
- One process; the README is short; tests run against one app and one database.
- The guarantees sit in Postgres (exclusion constraint, RLS), so they hold for any future client.
- The existing dependency cruiser rules already stop the company edge from importing operator code.

**Cons**:
- No typed RPC client for future mobile or kiosk clients; they would use the REST API.
- If the operator side ever needs separate deploy, VPN or IP rules, it has to be split out later.

### Option 2: The first plan: Next.js BFFs, a Hono service with two pools, separate admin app, PgBouncer, Valkey, idempotency keys, capability flags

Two Next.js apps call a Hono service over HTTP with bearer tokens. The service owns the database, holds a tenant pool and an admin pool, caches with an in memory LRU and later Valkey, and extends tenants by flags and hooks.

**Pros**:
- The service could be reused by other clients, with a typed RPC client.
- Admin and tenant surfaces are fully separate for deploy and rate limits.
- Valkey and idempotency would absorb retry traffic before it reaches the database.

**Cons**:
- Three processes to start locally, three things to test, a trusted `X-Tenant-Id` header that any holder of the shared token can forge.
- It bypasses Prisma and the ports and adapters layout the repo already enforces, so the work would be done twice.
- Valkey, the idempotency table and capability flags answer problems the brief does not have (growth here means more rooms and companies, not per company features).
- The cache has nothing worth caching: three rooms, and availability must be real time.

### Option 3: Server Actions only, no REST API

The simplest option: no `/api/v1`, results go straight to the UI.

**Pros**:
- Least code; one translation of failures to messages.

**Cons**:
- The brief evaluates API design, and Server Actions are not a documented, callable API.
- No HTTP status semantics to show.

## Rationale

Option 1 follows the forces in Context. The brief's three hard rules are all database problems: overlap is a constraint, isolation is a policy, and a failure reason is a result type. Putting them in Postgres means they hold under concurrency and survive coding mistakes. Everything the plan added on top solves scale or multi client problems that a 72 hour first version does not have, and each added process lowers the chance that the project runs cleanly from the README.

**Typed result with a mapper (the "middle path").** Hono's real contribution to error handling is consistent HTTP mapping. That needs about thirty lines here: one `reasonToHttp` function and one message catalog. Doing it once at the edge, not twice across a service boundary, keeps the reason from being lost or rewritten on the way to the user. Hono itself does not translate database errors, so the `23P01` mapping would have been ours either way.

**Overlap in the database.** Under a race both inserts pass any application pre check, because neither has committed. The exclusion constraint makes the second insert wait for the first transaction and then fail, so the winner is decided by commit order across processes. There is no application pre check: the conflict text is fixed, and a check under RLS cannot see other companies' bookings anyway. The create statement uses `ON CONFLICT DO NOTHING` so a double submit from one company resolves to the existing booking instead of an error. The raw error is never forwarded because its detail would name the conflicting booking.

**Two roles, with `BYPASSRLS` for the operator.** A `BYPASSRLS` role skips policies always, while a table owner skips them unless `FORCE` is set. An owner can also write and change the schema. A dedicated `SELECT` only `BYPASSRLS` login gives the operator what it needs and nothing else, and `FORCE` protects the tables even if the owner role is ever used by mistake. `FORCE` only means something if the owner is not a superuser, because superusers bypass RLS regardless. The local docker owner was a superuser, so the owner becomes a plain login. The cost is that seeds, fixtures and Prisma Studio must set a tenant or use the operator login, which keeps the isolation story honest in a demo. This keeps the plan's point (one connection, one privilege level) without a second service. The availability function gets its own `BYPASSRLS` owner because `FORCE` would otherwise filter it by the caller's company.

**Cache deferred.** The only hot read is availability, which cannot be stale: after a cancel the room must show as free, which is the brief's own complaint. Rooms are three rows, a primary key lookup. A cache would add an invalidation bug source for no measured gain. If operator metrics ever get slow, a short lived cache of pre aggregated results is the first place it would pay off.

**Idempotency deferred.** The database already prevents a duplicate booking. What a retry adds is a confusing `conflict` for a booking that succeeded. The disabled button and the "same exact booking returns 200" rule cover the realistic case (a double click, a repeated submit) with no new table. Full keys matter when external clients retry or when side effects like email appear. The Hono idempotency middleware is a third party package whose only atomic store on Node is Redis, so adopting it would also pull Valkey in; the better fit later is a Postgres backed key table committed in the same transaction as the booking.

**Not found instead of forbidden.** RLS makes another company's booking invisible, so the natural answer is `not_found`. It also avoids confirming that an id exists.

**Booking rules.** The recommended values (30 minute grid, Monday to Friday 08:00 to 20:00, 30 minutes to 4 hours, same day, 60 days ahead, cancel before start) were chosen for three reasons. Each yields a distinct failure reason the brief asks for. Opening hours give occupancy a real denominator. And the 60 day horizon keeps far future bookings from distorting metrics. A cancellation window was left out because it adds a rule and tests for little business value in v1.

## Alternatives weighed on sub decisions

| Decision                     | Chosen                                                           | Runner up                                         | Why not the runner up                                                                                              |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Company identity             | Seeded users and a signed cookie picker                          | Company switcher with no users                    | Loses "who booked", which the operator and audit need later.                                                       |
| Operator reads               | Dedicated read only `BYPASSRLS` login                            | Owner role behind a port (ADR 0003 today)         | The owner can also write and alter the schema.                                                                     |
| Owner login                  | Non superuser `espacios_owner` with `FORCE`                      | Keep the docker superuser and drop `FORCE`        | Simpler local setup, but then RLS protects only the app login and the README must say the owner bypasses it.       |
| Double submit by one company | `ON CONFLICT DO NOTHING` then an RLS scoped lookup returns 200   | Lookup first, then insert                         | Two identical simultaneous requests both miss the lookup, and the loser gets `conflict`.                           |
| Who cancels                  | Any member of the company                                        | Only the booker                                   | Stuck booking when the booker is away, and a second ownership rule.                                                |
| Roles creation               | Infra init SQL and test global setup                             | Inside a migration                                | `BYPASSRLS` needs a superuser and Prisma's shadow database replays migrations in the same cluster.                 |
| Users and companies          | No RLS, names listed as non private                              | RLS plus a definer sign in lookup                 | More machinery for demo seed data.                                                                                 |
| Open minutes in metrics      | `domain` TypeScript                                              | SQL                                               | Keeps the opening hours constant in one place.                                                                     |
| Availability                 | `SECURITY DEFINER` function with column grant                    | A trigger fed `room_busy` table                   | Duplicates data and can drift from the real bookings.                                                              |
| Overlap                      | Exclusion constraint                                             | Unique index on slots, or `SELECT ... FOR UPDATE` | The unique index misses partial overlaps. Row locks cannot lock a row that does not exist yet.                     |
| Metrics scope                | Occupancy per room, usage per company, weekday by hour heatmap   | Add a rule based insights list                    | Cut first if time is short; the three kept already answer the brief's four questions.                              |
| Error body                   | `{ code, message }`                                              | RFC 9457 problem details                          | Same information; can be adopted later with no breaking change to the reason codes.                                |
| API contracts                | Zod input schemas at the web edge, view types from `application` | A shared `packages/contracts` of Zod schemas      | One consumer, published with the API, so a changed view already fails `typecheck`. Extract it for a second client. |
