# AI usage log

Raw notes for the README "Uso de IA" section (challenge section 5). Add an entry **when it happens**, not at the end.
Keep each entry to two or three lines.

## Tools

- Claude Code (Claude Opus) with project skills: `/scope`, `/architect`, `/develop`, `/test`, `/check`, `/debug`,
  `/document`, `/sync`.

## Delegated tasks

- Setting up the agent environment (skills, quality gate runner, hooks) from a previous project.

## Corrected, changed or discarded

<!-- Format: date · what the AI proposed · what I did instead · why -->

- 2026-11-11 · An AI assisted architecture plan proposed a separate Hono service, an admin app, PgBouncer, Valkey, idempotency keys and capability flags · Kept one Next.js app with two database roles and deferred the rest to "next version" (spec 0001) · Too much infrastructure for a 72 hour first version, and it bypassed the ports and adapters layout.
- 2026-11-11 · The same plan guarded overlaps with a unique index on (room, date, slot) · Replaced it with an exclusion constraint on a time range · The unique index lets 10:00 to 12:00 and 11:00 to 13:00 both succeed.
- 2026-11-11 · The plan put row level security on every table · Rooms stay shared with no RLS, and availability goes through a function that returns busy intervals only · Otherwise a company could not see that a room is taken.
- 2026-11-11 · The default flow let the same agent that wrote a feature also write its tests · Changed to: tests ship with each slice (written from the spec, critical proofs first), then a separate fresh agent that did not write the code tries to break it · Tests written by the code's author tend to copy its assumptions. The second agent may only test behaviours named in spec 0001, the scope row or the brief, reports anything else as a finding, never edits production code or weakens tests, and runs against real Postgres. Used on the risky slices only (database, booking, cancel, metrics, cookie).
- 2026-11-11 · A first answer from the assistant said the operator could use ADR 0003's owner role · Switched to a dedicated read only `BYPASSRLS` role plus `FORCE` row level security · The owner can also write and change the schema.
- 2026-11-11 · The assistant opened a branch for every commit, chores included, then collapsed everything onto `main` alone · Kept `main` for the setup and released versions, `develop` for integration with small changes committed on it directly, and `feat/*` branches from `develop` only for new features · One branch per commit is noise, but a single branch loses the release boundary the brief's commit history should show.
- 2026-11-11 · For the database foundation, `/test` sent a fresh agent to write a second, adversarial suite on top of the 40 integration tests the slice already shipped with · Stopped it and kept the existing tests plus the manual `/check verify` run · The brief asks for automated tests of the critical behaviours, not full coverage; overlap, concurrency, isolation, roles and seeds were already proven against real Postgres, and the hours go further on the missing screens.
- 2026-11-11 · Spec 0001 (written with the assistant) set the session cookie to `userId.signature`, yet the scope asks for a 401 on an expired cookie · Changed to `userId.expiresAt.signature`, with the expiry signed and checked on the server · Only the browser enforces `maxAge`, so a copied cookie would have stayed valid forever. Found by `/develop` before writing the code.
