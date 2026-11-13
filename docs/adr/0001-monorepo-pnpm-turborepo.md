# 0001. Monorepo with pnpm workspaces and Turborepo

- Status: accepted

## Context

The brief asks for a React + TypeScript frontend and a Node.js + TypeScript backend that run locally from the README. Business rules (no overlap, tenant isolation, metrics) must be shared and tested apart from both.

## Decision

- **Workspaces:** one repository with pnpm workspaces (`apps/*`, `packages/*`).
- **Task running:** Turborepo, with caching and `--filter=...[base]` for affected-only runs.

## Consequences

- A change to a rule and all its consumers lands in one commit.
- Affected-only hooks and CI keep feedback fast.
- Workspaces import each other through public entries only, enforced by dependency-cruiser.
