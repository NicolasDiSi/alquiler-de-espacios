---
name: architecture-boundaries
description: Decide where code goes in the alquiler-de-espacios monorepo and add ports/adapters correctly. Use before creating any file, adding a dependency, calling Prisma or another vendor SDK, adding a business rule or permission check, or when `pnpm depcruise` / the "boundaries" gate fails.
---

# Architecture boundaries

The layer table and the rules live in `AGENTS.md`. This skill is the procedure for applying them.

## 1. Classify the change

Ask, in order:

1. **Is it a rule about the business?** Examples: booking validity, overlap, cancellation, who may do what, how a metric is defined. Then it goes in `packages/domain`, pure TypeScript, with no imports outside `domain`.
2. **Is it a shape that crosses a process or network boundary?** Examples: an API request or response DTO. A request schema is Zod in the edge (`apps/web/src/lib/<edge>/`); a response is the use case's view type in `packages/application`. There is no shared `contracts` package while `apps/web` is the only consumer (spec 0001 rationale).
3. **Is it a workflow that coordinates rules and side effects?** Examples: "book a room", "cancel a booking", "utilization report". Then it is a use case in `packages/application`. It receives ports as dependencies and checks the domain policy before acting.
4. **Is it talking to something outside the process?** Examples: the database. Then it is an adapter (`packages/db`), implementing a port.
5. **Is it delivery?** Examples: an HTTP route, a Server Action, a page. Then it goes in `apps/web`. It parses input, resolves the actor, calls the use case and maps the result.

If a piece of code answers "yes" to more than one question, split it.

## 2. Adding an external capability

1. **Port.** Declare the interface in `packages/application/src/ports/`, using domain types in its signatures, never vendor types.
2. **Adapter.** Implement the port in the adapter package.
3. **Wiring.** Wire the adapter in `apps/web/src/composition/`.
4. **Validate.** Run `pnpm check:ai --gate=boundaries`.

## 3. Smells that mean "wrong layer"

- A `.tsx` file, route handler or Server Action decides who may act, or checks overlap. That logic belongs in `domain` (and the database).
- A use case imports `@prisma/client` or `next/*`. Use a port instead.
- An adapter contains an `if` on business state, for example "if the booking is cancelled…". Move the decision into the domain.
- `domain` imports `zod`, `node:crypto` or `Date.now()`. Use the `Clock` and `IdGenerator` ports, and pass values in.
