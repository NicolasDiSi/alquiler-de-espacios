# 0003. Prisma 7 on PostgreSQL; shared schema with tenant_id and row level security

- Status: proposed

## Context

Several client companies share the platform. A leak between companies is the worst possible failure. Two companies booking the same room at once must never both succeed. Bookings must survive restarts.

## Decision

- **Data stack:** PostgreSQL 17 with Prisma 7 through the `@prisma/adapter-pg` driver adapter. Prisma Studio is the data panel.
- **Shared schema:** every company owned table has a `tenant_id` column.
- **Two barriers for isolation:**
  - **Row level security.** Every `UnitOfWork.run` is one transaction that first calls `set_config('app.tenant_id', <tenant>, true)`. RLS policies compare the column to that setting, for reads (`USING`) and writes (`WITH CHECK`).
  - **Explicit filters.** Every repository also filters by tenant.
- **Roles** (amended by spec 0001, see below): the app connects as `espacios_app` in `espacios_runtime`, which owns no table, so RLS always applies.
- **No overlap:** an exclusion constraint on (room, time range) for active bookings, so the database rejects the second of two concurrent requests.
- **Time zones:** every timestamp is `timestamptz`.

## Consequences

- A forgotten `where tenantId` returns nothing instead of another company's data.
- `SET LOCAL` only works inside transactions; session level settings would leak across pooled connections, so they are forbidden.
- Every new tenant table needs an RLS policy, grants to `espacios_runtime` and an isolation test. The `multi-tenant-safety` skill lists the steps.

## Amendment (2026-11-11, spec 0001)

The first version had the docker superuser own the schema and serve the operator's cross company reads. Superusers bypass RLS even with `FORCE`, and the operator only needs to read, so the roles changed:

- **`espacios_owner`** owns the schema and runs migrations, seeds and Studio. It is not a superuser (`LOGIN CREATEDB`, for Prisma's shadow database).
- **`FORCE ROW LEVEL SECURITY`** is on every tenant table, so the owner is filtered too. Seeds and fixtures set the tenant per company.
- **`espacios_operator`** serves the operator's cross company reads: `LOGIN BYPASSRLS` with `SELECT` grants only, so it cannot write (widened on 2026-11-12, see the next amendment). It is wired only in the app's composition root.
- **`espacios_availability`** (`NOLOGIN BYPASSRLS`) owns `room_busy_intervals`, a `SECURITY DEFINER` function that shows companies when a room is busy (start and end only), which RLS would otherwise hide.
- **Where roles are created:** `BYPASSRLS` roles are cluster wide and need a superuser, and Prisma's shadow database replays migrations in the same cluster, so `CREATE ROLE` lives in `infra/local/postgres/01-roles.sql` (run by compose and by the test setup), never in a migration. Migrations only grant. An existing local volume needs `docker compose down -v` once to pick up a roles change.

## Amendment (2026-11-12, spec 0004)

The operator now administers the catalog, so `espacios_operator` is read only on tenant data and may write catalog data:

- **Grants:** `INSERT` and `UPDATE` on `facility`, `room`, `company` and `block`, and `INSERT` on `app_user`. A `BEFORE INSERT` trigger on `app_user` refuses an `operator` row from this login, so it can only create members.
- **Still refused:** any write to `booking` (only members create and cancel bookings) and any `DELETE`. Foreign keys are `ON DELETE RESTRICT`, so nothing is deleted.
- **Companies** still never read `block`. They reach it only through `room_busy_intervals`, which returns a `kind` and no reason.
- **Why:** growth (new sedes, rooms and clients) without a deploy, with the smallest login that can do it. See [spec 0004](../specs/_root/0004-operator-administration-and-metrics/index.md).
