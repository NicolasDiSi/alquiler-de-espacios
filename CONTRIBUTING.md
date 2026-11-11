# Contributing

## Workflow

1. **Work in small slices.** Each slice goes end to end (domain, use case, database, API, UI, tests) and ends in one or more commits.
2. **Keep one concern per commit.** Each commit leaves the repo green, and its message follows [Conventional Commits](https://www.conventionalcommits.org/) with a scope from `commitlint.config.mjs`:

   ```
   feat(domain): reject bookings that end before they start
   fix(db): map the overlap constraint violation to a conflict
   ```
3. **Run `pnpm check:ai` before pushing.** The `pre-push` hook runs it on the affected workspaces anyway.

## Definition of done

- **Layers:** the code lives in the right layer and `pnpm depcruise` passes.
- **Tests:**
  - Domain rules and use cases are tested.
  - Database guarantees (no overlap under concurrency, tenant isolation) have integration tests against a real Postgres.
- **UI states:** loading, empty, error and disabled states are handled, and every failed operation says why.
- **Accessibility:** semantic HTML, labels, keyboard support and visible focus. The axe check in E2E passes.
- **Docs:** decisions go to `docs/adr/` or `docs/specs/`; assumptions and limitations go to the README.

## Code review checklist

1. **Correctness.** Does it do what the slice says? Are the edge cases handled (adjacent bookings, past dates, zero length)?
2. **Security.** Is the policy called in the use case, not only in the UI? Is input validated with Zod at the boundary?
3. **Tenancy.** Does all company data go through the tenant scoped transaction?
4. **Boundaries.** No business rule in a component, route handler or adapter; no vendor SDK outside its adapter.
5. **Readability.** Do the naming and structure match the surrounding code?

## Architecture decisions

Record significant decisions as ADRs in `docs/adr/`, using `docs/adr/0000-template.md`. Superseded ADRs stay in the folder, with their status updated.
