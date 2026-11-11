# Domain (`@espacios/domain`)

## Overview

The business rules, in pure TypeScript: rooms, bookings and their lifecycle, overlap and validity rules, who may do what, and how utilization metrics are defined. Every other workspace depends on it, and it depends on nothing.

## Key files

| File                   | Owns                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `src/shared/brand.ts`  | Branded ids (`TenantId`, ...) so ids of different kinds never mix |
| `src/shared/result.ts` | `Result`, `ok`, `fail` and the closed list of `DomainErrorCode`s  |

## Commands

```bash
pnpm --filter @espacios/domain test        # Vitest with coverage, 90% threshold
pnpm --filter @espacios/domain typecheck
```

## Conventions

- **Pure functions.** A transition takes the entity, the input, the actor and `at: Date`, and returns `Result<{ entity, events }>`. Business errors are `fail(code, message)`; nothing throws for them. Messages are full sentences, because the UI shows them ("why the booking could not be made").
- **Closed lists.** Anything the system branches on (status, reason) is an `as const` list plus its type.
- **Branded ids.** Cast only at the edges (adapters, fixtures).
- **Policies check the tenant first**, then the role, then attributes (owner of the booking).

## Gotchas

- `dependency-cruiser` rejects any import from outside `src/`: no npm packages, no Node built ins, no `zod`. Ask for `now` and ids as arguments (the `Clock` and `IdGenerator` ports live in `application`).
- `exactOptionalPropertyTypes` is on. An optional field is either absent or a value, never `undefined` by assignment.
- The overlap rule lives here for clear messages, **and** in the database as a constraint for concurrency. Keep both.

## Agent skills

- [use-case-recipe](../../.claude/skills/use-case-recipe/): local, the order for adding a rule, its policy and its tests
- [architecture-boundaries](../../.claude/skills/architecture-boundaries/): local, deciding whether code belongs here at all
