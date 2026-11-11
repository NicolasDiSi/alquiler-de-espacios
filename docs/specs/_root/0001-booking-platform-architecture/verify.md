# Verify: database foundation · spec 0001 · updated 2026-11-11

_Steps derived from spec 0001 ("Required proofs" and the scope's "Done when" for feature 2). `/check verify` runs these; `/test` locks the durable ones. Later features append their own sections below._

## Database foundation (feature 2)

### Commands

- [ ] `pnpm --filter @espacios/db test` → all tests pass against a throwaway Postgres (Docker running) → P-1, P-2, P-3, P-5, P-13, P-15
- [ ] `docker compose down -v && pnpm services:up && pnpm db:deploy` → "All migrations have been successfully applied", run as `espacios_owner` (not a superuser) → scope "migration run as the owner"
- [ ] As `espacios_owner`: `select relforcerowsecurity from pg_class where relname = 'booking'` → `t` → P-3
- [ ] `pnpm db:seed` twice, then as `espacios_operator`: count of `booking`, `room`, `company`, `app_user` → the same numbers after both runs (about 40 bookings with some cancelled, 3 rooms, 3 companies, 5 users) → P-13
- [ ] As `espacios_app` with no tenant set: `select count(*) from booking` → `0` (fails closed) → P-3
- [ ] As `espacios_owner` with no tenant set: `select count(*) from booking` → `0` (`FORCE` applies to the owner) → P-3
- [ ] As `espacios_app` inside a transaction with `set_config('app.tenant_id', 'company-acme', true)`: bookings returned all have `tenant_id = 'company-acme'` → P-3
- [ ] As `espacios_app`: `update room set capacity = 1` → permission denied → shared tables are read only for companies
- [ ] As `espacios_operator`: `delete from booking` → permission denied; `select` on every table works → P-5
- [ ] As `espacios_app`, two companies insert the same room with ranges 10:00 to 12:00 and 11:00 to 13:00 → the second fails with SQLSTATE `23P01`; 10:00 to 11:00 then 11:00 to 12:00 both succeed → P-2
- [ ] N parallel inserts of one room and range from different companies → exactly one row, the others fail with `23P01` and the error text names no other company → P-1
- [ ] `room_busy_intervals(room, from, to)` as `espacios_app` → returns only start and end of other companies' confirmed bookings, nothing for cancelled ones → P-4 (database part)
- [ ] `schema-drift.test.ts` → `prisma migrate diff` between migrations and `schema.prisma` is empty → P-15
- [ ] README "Local database" section mentions `docker compose down -v` after a roles change → scope "Done when"

### Value sourcing covered here

- [ ] Tenant for every company query comes only from `app.tenant_id` set inside the transaction (vary the tenant: `company-acme` against another company sees disjoint rows) → Value sourcing, "current company id" (database side; the cookie side is feature 3)
- [ ] Seeds: rooms, companies, users and demo bookings come from `pnpm db:seed` and follow the booking rules (weekdays, 08:00 to 20:00 Buenos Aires, 30 minute grid, at most 4 hours) → Value sourcing, "Seeds"

### Acceptance coverage

- Migration as the owner: deploy step · Isolation as `espacios_app`: P-3 steps · Overlap: P-1, P-2 steps · Seed twice under `FORCE`: P-13 step · README note: last command step
- Not covered here (later features): P-6, P-7, P-9 (error contract, domain rules), P-4 endpoint and `mine` flag (feature 6), P-8 (feature 8), P-10 (feature 11), P-11 and P-12 (features 5 and 7), P-14 (feature 3)
