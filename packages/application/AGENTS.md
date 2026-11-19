# Application (`@espacios/application`)

## Overview

The use cases and the ports. A use case loads what it needs inside a tenant transaction, checks the domain policy, applies the domain change and saves it. Ports are the interfaces adapters implement; this workspace never talks to a database or vendor itself.

## Key files

| File                      | Owns                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| `src/ports/ports.ts`      | Every port: `UnitOfWork`, `TenantTransaction`, clock, ids, `ConcurrencyError` |
| `src/use-cases/shared.ts` | `Dependencies` and `withConflictHandling`                                     |

## Commands

```bash
pnpm --filter @espacios/application test        # Vitest with coverage, 85% threshold
pnpm --filter @espacios/application typecheck
```

## Conventions

- **The command order is fixed:** load (`not_found` if missing), authorize, apply the domain change, save.
- **Validate before writing.** Only a thrown error rolls the transaction back. A returned failure must leave nothing written.
- **Repositories from a `TenantTransaction` are already tenant scoped.** Their methods never take a tenant id.
- **A lost race becomes `conflict`.** A booking rejected by the database overlap constraint is mapped to a `conflict` result with a message the user understands.
- **Operator reads across companies** (metrics, global view) go through a separate, explicit port, never through a tenant transaction.

## Gotchas

- `dependency-cruiser` allows imports only from `domain` and `zod`. A vendor SDK here fails the boundaries gate.
- Ports are excluded from coverage. Behaviour is covered through the use case tests.

## Agent skills

- [use-case-recipe](../../.claude/skills/use-case-recipe/): local, how to add or change a write here
- [architecture-boundaries](../../.claude/skills/architecture-boundaries/): local, adding a port and its adapters
