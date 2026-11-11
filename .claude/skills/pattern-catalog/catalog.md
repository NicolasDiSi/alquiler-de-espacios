# Pattern catalog

One entry per pattern this project uses, or has decided about on purpose. Keep entries short. Add one when a design needs a pattern that is not here (see SKILL.md). Status is `used`, `planned` or `not now` (a decision to wait, with what would change it).

## Ports and adapters
- **Status:** used
- **Reach for it when:** business code needs something outside itself (the database, mail, a calendar).
- **Decision:** the rule lives in `packages/domain` or `packages/application` against a port; the adapter lives in an adapter package and is wired only in `apps/web/src/composition`.
- **Where it lives:** `packages/application/src/ports/ports.ts`, `packages/db/src/unit-of-work.ts`.
- **Proof:** dependency cruiser (`pnpm check:ai --gate=boundaries`).

## Unit of work
- **Status:** used
- **Reach for it when:** a change must commit together with anything else it writes.
- **Decision:** every write is a use case that runs inside one tenant transaction. Failures are returned, not thrown, before any write.
- **Where it lives:** `packages/db/src/unit-of-work.ts`.
- **Proof:** `packages/db/src/unit-of-work.test.ts` (rollback, setting stays in the transaction).

## Tenant isolation twice
- **Status:** used for the transaction scope; **planned** for the first company table (bookings)
- **Reach for it when:** a table holds a company's data.
- **Decision:** row level security keyed on `app.tenant_id` and a tenant filter in every repository, so one missing filter cannot leak. Operator reads across companies are rare, named and reviewed (`multi-tenant-safety` skill).
- **Where it lives:** `packages/db/src/unit-of-work.ts`, the migration that adds the bookings table.
- **Proof:** `database-guarantees.test.ts` (to be created with the first tenant table), the foreign id `not_found` tests.

## Overlap guarded by the database
- **Status:** planned (the first booking slice)
- **Reach for it when:** two requests can claim the same room and time.
- **Decision:** a PostgreSQL exclusion constraint on (room, time range) over active bookings. The domain checks overlap first only to give a clear message; the constraint is the authority under concurrency. Its violation (`23P01`) maps to a `conflict` result. Cancelling sets `status = 'cancelled'` and `cancelled_at`, which takes the booking out of the constraint (`WHERE status = 'confirmed'`) and frees the slot.
- **Where it lives:** the bookings migration, the booking repository in `packages/db`.
- **Proof:** a concurrency test: N simultaneous bookings for the same slot from different companies, exactly one succeeds; cancel then rebook succeeds.

## Idempotent write
- **Status:** planned in a light form (booking creation). Full idempotency keys: **not now** (spec 0001); would change if an external client retries or a side effect like email appears.
- **Reach for it when:** a retry or a double click can repeat a write.
- **Decision:** the database already refuses a duplicate (the exclusion constraint). The UI disables submit while pending, and a request for the exact same room and range by the same company returns the existing booking with 200 instead of `conflict`. No keys table.
- **Proof:** a double submit e2e or integration test.

## Optimistic concurrency
- **Status:** not now
- **Reach for it when:** two people can edit the same record and a lost update would matter.
- **Decision:** bookings are created and cancelled, not edited, so there is no lost update to guard. `ConcurrencyError` and `withConflictHandling` exist for when an edit appears.
- **Revisit:** when bookings can be moved or edited.

## Backends for frontends
- **Status:** used (by design)
- **Reach for it when:** a second kind of client needs different data or permissions.
- **Decision:** two edges in `apps/web`: the company edge (its bookings, availability as busy slots only) and the operator edge (every company, metrics). See the `bff-edges` skill.
- **Proof:** contract tests per edge; a company never receives another company's name or booking id.

## Consistency across writes (the dual write problem)
- **Status:** not now
- **Reach for it when:** one action must write in two places that do not share a transaction (a table and an email).
- **Decision, in this order:** (1) one transaction; (2) write one place and derive the other; (3) a transactional outbox. Never "write A, then write B and hope".
- **Revisit:** if booking confirmations are sent by email.

## Read through cache
- **Status:** not now
- **Reach for it when:** a read is hot and a copy is acceptable for a short time.
- **Decision:** availability changes on every booking, and the challenge load is small, so no cache. Measure first.
