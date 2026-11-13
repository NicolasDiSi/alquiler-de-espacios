# Database (`@espacios/db`)

## Overview

The PostgreSQL adapter: the Prisma 7 schema and migrations, row level security, and the `UnitOfWork` that implements the application ports. Tenant isolation and the no-overlap rule are enforced here by the database itself, not only by the code above it.

## Key files

| File                          | Owns                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`        | Tables (snake_case through `@map`): `company`, `app_user`, `room`, `booking`                                                                                                         |
| `prisma/migrations/`          | Generated migrations plus hand written SQL: grants, RLS with `FORCE`, exclusion and CHECK constraints, functions                                                                     |
| `prisma/seed.sql`             | Idempotent demo data for `pnpm db:seed` (fixed ids, `ON CONFLICT DO NOTHING`, tenant set per company)                                                                                |
| `prisma/seed-scale.sql`       | Volume data for `pnpm db:seed:scale` (run by `pnpm dev`, never by the e2e or `seed.test.ts`, which count the base seed's rows), same rules as `seed.sql`                             |
| `prisma.config.ts`            | CLI config: schema, migrations, owner connection                                                                                                                                     |
| `src/unit-of-work.ts`         | `createPrismaUnitOfWork`: one transaction per run, `set_config('app.tenant_id', ..., true)`, scoped repositories                                                                     |
| `../../infra/local/postgres/` | Cluster roles, created once by the superuser (compose init and the test global setup), never in a migration                                                                          |
| `src/testing/global-setup.ts` | One throwaway Postgres per test run: runs the roles SQL, migrates as the owner, hands out the login URLs. `startDatabase()` gives a test its own (`persistence.test.ts` restarts it) |
| `src/testing/outcomes.ts`     | Race assertions: every racer's outcome at once (`settledOutcomes`, `resultOutcomes`, `oneWinner`)                                                                                    |
| `src/testing/fixtures.ts`     | Test companies, rooms, members and bookings, written as the owner with the tenant set (`asTenant`)                                                                                   |
| `src/testing/prisma-cli.ts`   | Runs the real Prisma CLI in tests (seed, deploy, drift check)                                                                                                                        |
| `src/testing/sql-state.ts`    | Test only SQLSTATE unwrapping until the error contract feature adds the real `sqlState(err)`                                                                                         |

## Commands

```bash
pnpm services:up                               # local Postgres from compose.yaml
pnpm --filter @espacios/db generate            # Prisma client into src/generated (turbo runs it before typecheck and test)
pnpm db:migrate --name <change>                # new migration against the local database
pnpm db:deploy                                 # apply migrations (as espacios_owner)
pnpm db:seed                                   # demo data, safe to run twice
pnpm db:studio                                 # data panel on http://localhost:5555 (owner: FORCE hides bookings)
DATABASE_OWNER_URL=$DATABASE_OPERATOR_URL pnpm db:studio   # browse every company, read only
docker compose down -v                         # once, after a change to infra/local/postgres (init SQL runs only on a new volume)
pnpm --filter @espacios/db test                # needs Docker running (testcontainers)
```

## Conventions

- **Three logins (spec 0001, ADR 0003).** `DATABASE_URL` is `espacios_app` in `espacios_runtime`: the company edge, RLS applies, owns nothing. `DATABASE_OWNER_URL` is `espacios_owner`, a non superuser that owns the schema: migrations, seed, Studio, never the app. `DATABASE_OPERATOR_URL` is `espacios_operator`, `BYPASSRLS`, read only on tenant data and allowed to write the catalog (`facility`, `room`, `company`, `block`, members in `app_user`; never `booking`, no `DELETE`, spec 0004): operator reads and administration, wired only in `apps/web/src/composition`. The docker superuser `espacios` only creates roles.
- **Roles live outside migrations.** `CREATE ROLE` goes only in `infra/local/postgres/01-roles.sql`, which compose and `src/testing/global-setup.ts` both run, so tests use the real roles. Migrations only `GRANT`.
- **`FORCE ROW LEVEL SECURITY` is on `booking`,** so the owner is filtered too. Seeds and fixtures set `app.tenant_id` per company before writing bookings.
- **Two barriers.** Every repository filters by tenant, and RLS filters again. Keep both.
- **No overlapping bookings is a database constraint:** `EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed')`, so concurrent requests cannot both win. Map its violation (`23P01`) to a `conflict` result.
- **Other companies' bookings are visible only as busy intervals,** through `room_busy_intervals(room_id, from, to)`: `SECURITY DEFINER`, owned by `espacios_availability`, returning start and end only.
- **Raw SQL needs a drift check.** Constraints, policies, `FORCE` and functions are appended by hand to a `prisma migrate dev --create-only` migration; `schema-drift.test.ts` keeps the schema and migrations equal.
- **Every `DateTime` is `@db.Timestamptz(3)`.**
- **New tenant tables follow the `multi-tenant-safety` skill:** grants, an RLS policy, and tests.

## Gotchas

- Prisma 7 needs `prisma generate` before anything compiles: the client lives in `src/generated/` and is git ignored.
- Prisma blocks `prisma migrate reset` and `db push --force-reset` for AI agents until the user gives explicit consent. Ask first, and never work around it.
- Migration folders sort by timestamp. A hand written migration must sort after the migration that creates its tables.
- Install scripts are blocked by pnpm unless listed in `allowBuilds` (`pnpm-workspace.yaml`). Prisma's engines are allowed on purpose.

## Agent skills

- [prisma-cli](../../.claude/skills/prisma-cli/): `prisma/skills`, Prisma 7 CLI (generate, migrate, studio)
- [prisma-client-api](../../.claude/skills/prisma-client-api/): `prisma/skills`, queries, transactions, raw SQL
- [multi-tenant-safety](../../.claude/skills/multi-tenant-safety/): local, adding tenant tables and cross tenant reads safely
