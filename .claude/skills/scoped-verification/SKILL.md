---
name: scoped-verification
description: Pick the smallest check that covers a change in alquiler-de-espacios, and run the full set only before a commit that closes a slice. Use after editing code, before running any test, e2e or check:ai command, and when a run is slow.
---

# Scoped verification

Run what is relevant to the change, when it is relevant. The full set is for the end of a slice (and the pre push hook runs it), not for every edit.

## What to run

| You changed | Run |
| --- | --- |
| `packages/domain` | `pnpm --filter @espacios/domain test` |
| `packages/application` (use cases, ports) | `pnpm --filter @espacios/application test` |
| `packages/db` (schema, migrations, grants, constraints, adapter) | `pnpm --filter @espacios/db test` (needs Docker) |
| A pure helper or a form rule in `apps/web` | `pnpm --filter @espacios/web exec vitest run <folder> --reporter=dot` |
| Booking form, Mis reservas, the bookings API, how the current company is resolved | hand the user `pnpm check:ai --gate=e2e --suite=bookings` |
| Shell, theme, sidebar, design system page | hand the user `pnpm check:ai --gate=e2e --suite=shell` |
| Texts in `messages/es.json` | `pnpm check:ai --gate=strings`, then grep `e2e/` for the old text |
| Anything other code reads back: what is stored, a status, a cookie, a header, a timing | First search `e2e/` and `*.test.ts` for assertions on it and update them in the same change, then run the row above for the area |
| Imports or a new dependency | `pnpm check:ai --gate=boundaries` and `--gate=knip` |
| Anything, before a commit that closes a slice | `pnpm check:ai` |

## Rules

- **Start narrow, then widen.** Unit tests first, then the one suite for the area, then `check:ai` once at the end.
- **Never run the full end to end suite to check a small change.** Every e2e run builds the app; use the area's suite.
- **End to end runs start their own Postgres** in Docker (migrated and seeded) and delete it afterwards. They never touch the compose database.
- **Fix the failing gate, rerun only that gate.** Do not rerun the whole set to see if one fix worked.
- **Run long suites in the background** and read the result when they finish. Do not stop a run halfway and leave its server behind: a leftover `next start` holds port 3100 and the next run refuses to start.
- **Write the test first when the behavior has a clear contract** (a rule, a refusal, the overlap under concurrency). See it fail for the right reason, then write the code.
- **Prove a new test can fail.** Break the code on purpose once (drop the constraint, swap the order) and see the test go red. A test that passes on its first run proves nothing yet.
- **A failure with no exception and no log needs an integration test, not careful reasoning.** Constraints, grants, RLS and metric queries: run them against the real Postgres.
- **The e2e suite is run by the user.** Give the exact command, say which tests are new or edited, and keep working. Hold the commit of a flow change until they report green; run e2e yourself only when they ask. Unit and integration runs you do yourself.
- **A sub second e2e PASS is unverified.** The `e2e` tasks have `cache: false` in `turbo.json`, so one that finishes in under a second did not run: read why before trusting it.
- **Say what you skipped.** When you report, list the checks you ran and the ones you left for the full run.
