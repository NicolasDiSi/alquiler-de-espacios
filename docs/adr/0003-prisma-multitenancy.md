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
- **Roles:** the app connects as a login in `espacios_runtime`, which owns no table, so RLS always applies. The schema owner runs migrations and Studio, and serves the operator's cross-company reads through a separate, explicit port.
- **No overlap:** an exclusion constraint on (room, time range) for active bookings, so the database rejects the second of two concurrent requests.
- **Time zones:** every timestamp is `timestamptz`.

## Consequences

- A forgotten `where tenantId` returns nothing instead of another company's data.
- `SET LOCAL` only works inside transactions; session level settings would leak across pooled connections, so they are forbidden.
- Every new tenant table needs an RLS policy, grants to `espacios_runtime` and an isolation test. The `multi-tenant-safety` skill lists the steps.
