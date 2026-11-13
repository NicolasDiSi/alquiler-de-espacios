# AGENTS.md

## Project overview

alquiler-de-espacios is a technical challenge (Fontanella SRL, Senior Full Stack, 72 hours): a web app where client companies see meeting room availability, book rooms and cancel their own bookings, and the operator sees utilization metrics overall and per client company. The full brief is in [docs/challenge.md](docs/challenge.md); read it before planning.

**Status:** the foundations, booking, cancelling, room availability, the operator's administration (sedes, rooms, clients, blocks), its metrics API and dashboard, and the client and sede activity pages are built (specs 0001 to 0009). The company API is in [docs/api/company.md](docs/api/company.md), the operator's in [docs/api/operator.md](docs/api/operator.md). [docs/scope/_root/scope.md](docs/scope/_root/scope.md) holds the build order and each feature's status. The README covers run and test, architecture, assumptions, limitations, next version and AI usage. Left for delivery: the full `pnpm check:ai` with e2e and the release to `main`.

## Non negotiables from the brief

- **No overlapping bookings for the same room, even under concurrent requests.** Enforce it in the database (exclusion constraint), and prove it with a concurrency test against the real database.
- **Tenant isolation.** A client company never sees another company's private data. The operator has a global view.
- **Bookings persist** across restarts.
- **Clear results.** Every failed operation tells the user why (overlap, past date, invalid range, not yours...).
- Frontend React + TypeScript, backend Node.js + TypeScript. Runs locally from the README instructions.
- No full authentication, cloud infrastructure or production deploy required.

## Decisions made in /architect

[Spec 0001](docs/specs/_root/0001-booking-platform-architecture/index.md) records each one, with the alternatives and the reasons in its `rationale.md`, because the interview will ask about them. A new load bearing decision gets its own spec or ADR the same way.

- ADRs in `docs/adr/` (monorepo, ports and adapters, Prisma with RLS, TypeScript 6): spec 0001 builds on all four and amends ADR 0003 with the database roles.
- API style: Server Actions for the UI plus a documented REST API under `/api/v1`, both calling the same use cases and returning the same typed result.
- Company identity without real authentication: seeded users and a "sign in as" picker that sets an HMAC signed cookie. The server reads the company from the cookie, never from client input.
- Booking rules: a 30 minute grid, 30 minutes to 4 hours, up to 60 days ahead, cancel any time before the start. Hours, open weekdays and time zone belong to each sede since spec 0004 (the demo sede: Monday to Friday 08:00 to 20:00, `America/Argentina/Buenos_Aires`). See "Booking rules" in spec 0001 and spec 0004.
- Metrics: occupancy per room and overall, usage per company and a weekday by hour heatmap, over confirmed bookings only. See "Metrics (definitions)" in the spec.

## Stack

- **Language / Runtime**: TypeScript 6.0 on Node 24
- **Framework**: Next.js 16 in `apps/web` (React 19, App Router), Tailwind CSS v4, shadcn/ui, next-intl (Spanish, es-AR)
- **Key dependencies**: Prisma 7.10 on PostgreSQL 17, Vitest 5, Biome 2.6, dependency cruiser, knip, testcontainers, Playwright with axe
- **Package manager**: pnpm 12 workspaces with Turborepo 2 (shared versions in the `catalog:` of `pnpm-workspace.yaml`)

## Build approach

Tracer Bullet: one thin, real thread through every layer first (a company books a room and sees it in its list), then each slice thickens one segment end to end.

## Commands

```bash
pnpm install
pnpm dev               # services:up, db:deploy, db:seed, then the web app on http://localhost:3000
pnpm dev:app           # only the web app (turbo run dev), when the database is already up
pnpm check:ai          # every quality gate, one PASS/FAIL line each. Use this to iterate.
pnpm check:ai --gate=test --lines=60
pnpm check:ai --gate=e2e --suite=bookings   # one area's Playwright specs (suites: bookings, shell, operator)
pnpm check:fix         # Biome lint + format + import sorting
pnpm test              # turbo run test
pnpm typecheck
pnpm depcruise         # architecture boundaries
pnpm knip              # unused files, exports and dependencies
pnpm services:up       # local Postgres from compose.yaml (copy .env.example to .env.local first)
pnpm db:deploy         # apply migrations
pnpm db:seed           # demo companies, rooms, users and bookings (safe to run twice)
pnpm db:studio         # data panel on http://localhost:5555
```

- Tests start their own throwaway Postgres with testcontainers, so Docker must be running for `pnpm test` and `pnpm check:ai`.
- Gates: `biome`, `strings`, `typecheck`, `boundaries`, `knip`, `test`, `e2e`. The `e2e` gate builds `apps/web` and runs Playwright against `next start`, so it is the slow one; skip it while iterating on code it does not cover.
- Hooks: `pre-commit` runs Biome and the tests related to the staged files, `commit-msg` runs commitlint, `pre-push` runs `check:ai --affected`. `.claude/settings.json` runs Biome on every file the agent edits.

## Iterating cheaply

- Run `pnpm check:ai` (or `--gate=<name>`) instead of individual tools. It prints one line per gate and at most 20 lines per failure.
- When a gate fails, fix the reported files and rerun only that gate before running the full set again.
- Run the smallest check that covers the change, and the full set once at the end. The table is in [scoped-verification](.claude/skills/scoped-verification/).
- **The user runs end to end tests.** Hand over the exact command (for example `pnpm check:ai --gate=e2e --suite=bookings`), say which tests are new or edited, and keep working. Suites: `bookings` (book, my bookings, calendar marks), `shell` (shell, keyboard, accessibility) and `operator` (operator screens, conflicts).

## Workflow

`/scope` → `/architect` → `/develop` → `/test` → `/check` → `/sync`. Use `/debug` for bugs and `/document` for the README sections.

- **Commits:** the brief grades the commit history. Commit each meaningful step (one slice, one decision) with Conventional Commits. Never squash everything into one commit. Commit only when the user asks.
- **AI usage log:** when the user corrects, changes or discards something an AI proposed, add a short entry to [docs/ai-usage.md](docs/ai-usage.md) in the same change. It feeds the required README section.
- **Assumptions:** every business rule we decide that the brief leaves open goes to the README "Supuestos" list.

## Before writing code

- **Find the layer first.** Decide which layer the change belongs to (see the table below) before opening files. If it needs a new external capability, start with the port in `packages/application`.
- **Check the decision records.** Read `docs/adr/` and `docs/specs/` before changing anything they cover.

## Architecture: ports and adapters

The business rules do not know about Next.js or Prisma. `dependency-cruiser` enforces this (`.dependency-cruiser.cjs`); a violation fails `pnpm check:ai`.

| Workspace              | Role                                                                                  | May import                                     |
| ---------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/domain`      | Business rules: booking validity, overlap, cancellation, policies, metric definitions | nothing                                        |
| `packages/application` | Use cases and **ports** (interfaces). Orchestrates, never implements infrastructure.  | `domain`, `zod`                                |
| `packages/db`          | Prisma schema, migrations, RLS and the unit of work: the PostgreSQL adapter.          | `application`, `domain`                        |
| `packages/config`      | Shared TypeScript configuration.                                                      | nothing                                        |
| `apps/web`             | The web app (Next.js 16). See [apps/web/AGENTS.md](apps/web/AGENTS.md).               | anything; adapters only from `src/composition` |

- **New capabilities start as a port** in `application`, implemented in an adapter package, wired only in the app's composition root.
- **Use cases are the only entry point for writes.**
- **Authorization is a business rule.** Decisions are pure functions in `domain`; use cases call them before acting, and UI checks are only for display.
- **Tenant data is isolated twice:** row level security in the database and a tenant filter in every repository. See [packages/db/AGENTS.md](packages/db/AGENTS.md).

## Security

- **Untrusted input:** request bodies, query strings and form data. Validate them with Zod and never trust a company id sent by the client without checking it against the current identity.
- **Biome's `security` group is enforced.** No `dangerouslySetInnerHTML`, `eval`, `new Function` or raw `document.cookie` writes (two scoped exceptions in `apps/web`, see its AGENTS.md).
- **Supply chain.** Never bypass pnpm's minimum release age (no `minimumReleaseAgeExclude`); pin an older version instead. Allow an install script in `allowBuilds` (`pnpm-workspace.yaml`) only with a reason.

## Testing

- **Vitest:** tests live next to the code as `*.test.ts`. Coverage thresholds: `domain` 90%, `application` 85%, everything else 70%.
- **Integration:** real Postgres through `@testcontainers/postgresql` for repositories, RLS, the overlap constraint under concurrency and the metric queries.
- **End to end:** Playwright with axe in `apps/web/e2e/`, against the built app: book, see the failure reason, cancel, operator metrics.
- **One execution context.** The pre-commit hook, `pnpm check:ai` and CI all run Vitest inside each workspace. The root `vitest.config.ts` exists only for editors.
- **Race tests assert every outcome at once,** with `settledOutcomes` or `resultOutcomes` and `oneWinner` (`packages/db/src/testing/outcomes.ts`), never the count of winners first: a failure must print why each racer lost. Their transactions use `RACE_WAITS`, so load on the shared container never turns a race into timeouts.
- **The HTTP contract is tested twice:** `apps/web/src/app/api/v1/routes.test.ts` checks every route file (it authenticates, a member route reads no company id, it is documented) and `handlers.test.ts` calls the handlers with signed cookies. A new route needs its row in `docs/api/` or that test fails.
- **Never depend on the working directory.** Scripts, configs and test setups resolve paths from their own file (`fileURLToPath(new URL(..., import.meta.url))`), never from `process.cwd()`.

## Keeping the work consistent

- **A rule change carries its tests and docs in the same commit, titles included.** Before committing, grep the old rule's words in tests, specs, `docs/api/` and the README. A test that still names the old rule reads as a rule nobody updated.
- **Every brief rule lives in two places:** the database (a constraint, a trigger, RLS) or the use case under a lock (and then the test says so), plus an integration test against Postgres that names its criterion (`P-1`, `AC-18`).
- **Identity never comes from the request.** The company is the session's; a test sends another company's id in the body and checks it is ignored.
- **Every endpoint authenticates first** (`authenticateRequest` or `operatorRoute`), has its row in `docs/api/`, and each reason it answers has its status in `contract.test.ts`.
- **Closing a slice:** the full `pnpm check:ai` with e2e, then `/sync` so this file and the scope match the code.

## Code conventions

- **TypeScript:** strict mode, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Infer types from Zod schemas at boundaries.
- **Biome:** double quotes, semicolons, two-space indent, 120 columns, sorted imports.
- **Imports:** across workspaces, import through a package's public entry (`@espacios/<name>`), never its internals.
- **Dependencies:** avoid unnecessary ones. A new one needs a reason, and an ADR when it shapes the architecture.
- **Contributions:** commits and the review checklist are in `CONTRIBUTING.md`.

## Specs

Build specs from `/architect` go in `docs/specs/` (repo wide ones in `docs/specs/_root/`), format `NNNN-title.md` or a `NNNN-title/` directory. Architecture decisions are in `docs/adr/`. The scope lives in `docs/scope/`.

## Agent skills

- [architecture-boundaries](.claude/skills/architecture-boundaries/): local, which layer code belongs in, ports and adapters
- [use-case-recipe](.claude/skills/use-case-recipe/): local, adding a write: domain rule, policy, transaction, tests, concurrency proof
- [multi-tenant-safety](.claude/skills/multi-tenant-safety/): local, tenant tables, RLS, global overlap and operator reads
- [nextjs-server-client](.claude/skills/nextjs-server-client/): local, Server and Client Components, Server Actions, Route Handlers, caching
- [bff-edges](.claude/skills/bff-edges/): local, the company and operator edges, view DTOs, query ports, pagination
- [pattern-catalog](.claude/skills/pattern-catalog/): local, design patterns chosen in /architect, followed in /develop, checked in /check review
- [scoped-verification](.claude/skills/scoped-verification/): local, the smallest check that covers a change
- [e2e-patterns](.claude/skills/e2e-patterns/): local, writing and fixing Playwright tests in apps/web/e2e
- [calendar](.claude/skills/calendar/): local, the date picker and the room availability grid (keyboard, states, tenant visibility)
- [accessible-data-tables-and-grids](.claude/skills/accessible-data-tables-and-grids/): `smukh/a11y-agent-skills`, native table versus grid semantics, sorting, focus and selection
- [data-display-and-selection](.claude/skills/data-display-and-selection/): `dembrandt/dembrandt-skills`, table and list design, sorting, filters, how to present metrics
- [status-colors-and-errors](.claude/skills/status-colors-and-errors/): `dembrandt/dembrandt-skills`, a small set of status colors and errors with a way forward
- [ui-density](.claude/skills/ui-density/): `dembrandt/dembrandt-skills`, row height, density tokens and touch target size
- [scope](.claude/skills/scope/): `jsmastery-pro/skills`, the living product scope in `docs/scope/`
- [architect](.claude/skills/architect/): `jsmastery-pro/skills`, load bearing decisions and build specs in `docs/specs/`
- [develop](.claude/skills/develop/): `jsmastery-pro/skills`, building a feature from an approved spec
- [test](.claude/skills/test/): `jsmastery-pro/skills`, writing tests for changed code
- [check](.claude/skills/check/): `jsmastery-pro/skills`, verifying behavior and a fresh code review before merge
- [debug](.claude/skills/debug/): `jsmastery-pro/skills`, root cause bug fixing with a regression test
- [document](.claude/skills/document/): `jsmastery-pro/skills`, README sections, PR descriptions, changelogs
- [sync](.claude/skills/sync/): `jsmastery-pro/skills`, keeping AGENTS.md and the scope current after a change
- [audit](.claude/skills/audit/): `jsmastery-pro/skills`, bootstrapping and gap filling the AGENTS.md files
- [vercel-react-best-practices](.claude/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, React and Next.js performance
- [vercel-composition-patterns](.claude/skills/vercel-composition-patterns/): `vercel-labs/agent-skills`, React component composition
- [shadcn](.claude/skills/shadcn/): `shadcn/ui`, shadcn components, styling and registries
- [playwright-cli](.claude/skills/playwright-cli/): `microsoft/playwright-cli`, driving the browser and Playwright tests

The Prisma skills (`prisma/skills`) are listed in [packages/db/AGENTS.md](packages/db/AGENTS.md). Sources and hashes are in `skills-lock.json`.

## Context files

- [packages/domain/AGENTS.md](packages/domain/AGENTS.md): pure business rules and their conventions
- [packages/application/AGENTS.md](packages/application/AGENTS.md): ports, use cases and the command order
- [packages/db/AGENTS.md](packages/db/AGENTS.md): Prisma schema, migrations, row level security and the three database logins
- [apps/web/AGENTS.md](apps/web/AGENTS.md): the web app shell, theme tokens, preferences before the first paint, the Spanish catalog and the Playwright suites
