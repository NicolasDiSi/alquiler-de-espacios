---
name: use-case-recipe
description: Add or change a write in alquiler-de-espacios the mature way, covering domain change, policy, transaction and tests. Use when adding a command or query to packages/application, a new booking transition (create, cancel), a new permission, or any rule the brief calls critical.
---

# Use case recipe

## 1. Domain first (`packages/domain`)

1. **Write the rule as a pure function.** It takes the entity, the input, the actor and `at: Date`, and returns `Result<{ entity, events }>`.
   - Return `fail("invalid_input" | "invalid_transition" | "conflict" | "forbidden", message)`. Never throw for business errors.
   - Messages are user readable Spanish sentences; the UI shows them ("La sala ya está reservada de 10:00 a 11:00").
   - A cancelled booking keeps its row with a `cancelledAt`; metrics need the history.
2. **Add or extend a policy.** Tenant check first, then role (company member or operator), then attributes (owner of the booking).
3. **Test it** next to the code. Cover the happy path and every refusal (end before start, past date, zero length, adjacent bookings are allowed). Coverage must stay ≥ 90%.

## 2. Use case (`packages/application`)

1. **Order:** load in the tenant transaction (`not_found` if missing), authorize, apply the domain change, save.
2. **Validate before writing.** A returned failure must leave nothing written, because only thrown errors roll back.
3. **The database is the last word on overlap.** The adapter maps the exclusion violation to a typed error, and the use case turns it into `conflict` with a clear message.
4. **New infrastructure needs a port first.** Add it to `ports/ports.ts` (and to `TenantTransaction` if it is transactional), then implement it in `packages/db`.
5. **Tests** use in-memory fakes of the ports with a manual clock and sequential ids. Assert on the result, the stored state, and that nothing was written on refusal.

## 3. Prove the critical paths against Postgres (`packages/db`)

- **Concurrency:** fire N simultaneous bookings for the same room and slot (different companies) with `Promise.all`; exactly one succeeds, the rest return `conflict`.
- **Cancellation frees the slot:** cancel, then book the same slot again.
- **Isolation:** company A cannot read or cancel company B's booking.

## 4. Delivery

Expose the use case from the app (Route Handler or Server Action). See the `nextjs-server-client` skill.

## Checklist

- [ ] Domain function is pure (no `Date.now()`, no ids generated inside), with tests for each refusal
- [ ] Policy is enforced in the use case, not only in the UI
- [ ] Overlap is enforced by the database and tested under concurrency
- [ ] `pnpm check:ai` passes
