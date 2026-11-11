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
| Booking flows, company or operator screens, how the current company is resolved | the e2e specs for that flow: `pnpm --filter @espacios/web exec playwright test e2e/<spec>.ts` (after `pnpm --filter @espacios/web build`) |
| Shell, theme, sidebar, design system page | the shell, keyboard and accessibility specs only |
| Texts in `messages/es.json` | `pnpm check:ai --gate=strings`, then grep `e2e/` for the old text |
| Anything other code reads back: what is stored, a status, a cookie, a header, a timing | First search `e2e/` and `*.test.ts` for assertions on it and update them in the same change, then run the row above for the area |
| Imports or a new dependency | `pnpm check:ai --gate=boundaries` and `--gate=knip` |
| Anything, before a commit that closes a slice | `pnpm check:ai` |

## Rules

- **Start narrow, then widen.** Unit tests first, then the one suite for the area, then `check:ai` once at the end.
- **Fix the failing gate, rerun only that gate.** Do not rerun the whole set to see if one fix worked.
- **Run long suites in the background** and read the result when they finish. Do not stop a run halfway and leave its server behind: a leftover `next start` holds port 3100 and the next run refuses to start.
- **Write the test first when the behavior has a clear contract** (a rule, a refusal, the overlap under concurrency). See it fail for the right reason, then write the code.
- **Prove a new test can fail.** Break the code on purpose once (drop the constraint, swap the order) and see the test go red. A test that passes on its first run proves nothing yet.
- **A failure with no exception and no log needs an integration test, not careful reasoning.** Constraints, grants, RLS and metric queries: run them against the real Postgres.
- **Run the e2e for flow changes yourself** and fix what it finds before asking to commit. When a test fails, say whether the change caused it or it was already broken.
- **A sub second e2e PASS is unverified.** If one finishes in under a second, the gate did not run it: read why before trusting it.
- **Say what you skipped.** When you report, list the checks you ran and the ones you left for the full run.
