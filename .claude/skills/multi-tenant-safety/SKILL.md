---
name: multi-tenant-safety
description: Keep each client company's data isolated in alquiler-de-espacios. Use when adding or changing a Prisma model or migration, a repository, a raw SQL query, anything that reads across companies (operator metrics, global view), or when a test touches more than one company.
---

# Multi-tenant safety

The decision and its reasons are in `docs/adr/0003-prisma-multitenancy.md`. The proof that it works must live in `packages/db/src/database-guarantees.test.ts` (create it with the first tenant table).

## How isolation works

- **Transaction scope.** `createPrismaUnitOfWork` (`packages/db/src/unit-of-work.ts`) opens one transaction per `run` and calls `set_config('app.tenant_id', $1, true)`.
- **RLS policies.** Every tenant table compares `tenant_id` to that setting, for reads and for writes. Without the setting, no row matches.
- **Repositories** also filter by `tenantId`. Keep both barriers. Never remove the filter "because RLS covers it".
- **Roles.** Apps connect as `espacios_app` in `espacios_runtime` (`DATABASE_URL`). The owner (`DATABASE_OWNER_URL`) bypasses RLS and is only for migrations, Studio and the operator's cross-company reads.

## Adding a tenant table

1. **Model.** Add the model with `tenantId String @map("tenant_id")` and an index that starts with `tenantId`. Use `@db.Timestamptz(3)` on every `DateTime`.
2. **Migration.** Run `pnpm db:migrate --name <change>`, then add to the same migration, or to a follow-up hand written one:
   ```sql
   GRANT USAGE ON SCHEMA public TO espacios_runtime;
   GRANT SELECT, INSERT, UPDATE ON <table> TO espacios_runtime;
   ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON <table> TO espacios_runtime
     USING (tenant_id = current_setting('app.tenant_id', true))
     WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
   ```
   Do not `FORCE` RLS: the owner must keep working for operator reads.
3. **Shared tables.** Rooms and facilities belong to the operator, not to a company: no `tenant_id`, `GRANT SELECT` only to the runtime.
4. **Repository.** Write the repository inside `tenantTransaction(...)`, filtering by `tenantId` in every query.
5. **Tests.** In `database-guarantees.test.ts`, as the runtime role: an unfiltered `SELECT` returns nothing without a tenant, and only the current company's rows with one; a write with another company's `tenant_id` is rejected.

## Overlap is global, visibility is not

The no-overlap exclusion constraint must hold **across companies**, but RLS hides other companies' bookings. So:

- The constraint is enforced by the database regardless of RLS (constraints see every row). Rely on it, and map its error (`23P01`, `exclusion_violation`) to a `conflict` result.
- Availability shown to a company exposes only "busy" slots of a room, never who booked them. Serve it from a query that returns time ranges only (a `SECURITY DEFINER` function or the owner connection behind an explicit port).

## Cross-company reads

- **Only the operator reads across companies:** metrics and the global view.
- **Wiring:** they use the owner client (or a dedicated read role), created only in an app's `src/composition`, behind an explicit port, with a comment saying why.

## Never

- `SET` without `LOCAL`, or `set_config(..., false)`. A session setting leaks to the next request on a pooled connection.
- String concatenating ids into SQL in application code. Use `$queryRaw` tagged templates.
- Using the owner connection in a company's request handler.
- Taking the company id from the request body without checking it against the current identity.
