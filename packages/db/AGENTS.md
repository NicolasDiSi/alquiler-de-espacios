# Database (`@espacios/db`)

## Overview

The PostgreSQL adapter: the Prisma 7 schema and migrations, row level security, and the `UnitOfWork` that implements the application ports. Tenant isolation and the no-overlap rule are enforced here by the database itself, not only by the code above it.

## Key files

| File                          | Owns                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`        | Tables (snake_case through `@map`)                                                                               |
| `prisma/migrations/`          | Generated migrations plus hand written SQL: grants, RLS policies, exclusion and CHECK constraints                |
| `prisma.config.ts`            | CLI config: schema, migrations, owner connection                                                                 |
| `src/unit-of-work.ts`         | `createPrismaUnitOfWork`: one transaction per run, `set_config('app.tenant_id', ..., true)`, scoped repositories |
| `src/testing/global-setup.ts` | One throwaway Postgres per test run, migrated, with the runtime login                                            |
| `src/testing/fixtures.ts`     | Test companies written through the owner connection                                                              |

## Commands

```bash
pnpm services:up                               # local Postgres from compose.yaml
pnpm --filter @espacios/db generate            # Prisma client into src/generated (turbo runs it before typecheck and test)
pnpm db:migrate --name <change>                # new migration against the local database
pnpm db:deploy                                 # apply migrations
pnpm db:studio                                 # data panel on http://localhost:5555 (owner connection, sees every company)
pnpm --filter @espacios/db test                # needs Docker running (testcontainers)
```

## Conventions

- **Two connections.** `DATABASE_URL` is the `espacios_app` login in `espacios_runtime`: the apps use it, and RLS applies. `DATABASE_OWNER_URL` is the schema owner: migrations, seed, Studio and operator-wide reads.
- **Two barriers.** Every repository filters by tenant, and RLS filters again. Keep both.
- **No overlapping bookings is a database constraint** (for example `EXCLUDE USING gist (room_id WITH =, period WITH &&)` on active bookings), so concurrent requests cannot both win. Map its violation to a `conflict` result.
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
