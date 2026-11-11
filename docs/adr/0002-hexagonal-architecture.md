# 0002. Ports and adapters, enforced by dependency-cruiser

- Status: proposed

## Context

The critical rules (a room is never double booked, a company never sees another's data) must be testable without a database or a web framework, and must not change if the persistence or the UI changes. The brief also expects growth: more facilities and more companies.

## Decision

- **Layers:**
  - `domain` is pure business rules.
  - `application` holds the use cases and declares ports.
  - Adapter packages (`db`) implement the ports.
  - Apps wire adapters only in `src/composition`.
- **Enforcement:** `.dependency-cruiser.cjs` enforces the rules, and `pnpm check:ai` fails on violations.
- **Authorization:** decisions are pure policy functions in `domain`, called by use cases.

## Consequences

- Domain logic is tested without databases or mocks.
- There is more indirection: a new external capability needs a port, an adapter and wiring.
