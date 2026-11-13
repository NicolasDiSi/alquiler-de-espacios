# 0004. TypeScript 6.0 until Next.js supports TypeScript 7

- Status: accepted

## Context

- **TypeScript 7** is a native port and much faster, but has no stable programmatic API until 7.1, and Next.js relies on that API for its type-check and its editor plugin.
- **Release age.** pnpm's minimum release age protects us from freshly published packages.

## Decision

- **Pin `typescript@6.0.3`** across the monorepo.

## Consequences

- Type-checking is slower than it could be. Turborepo caching and affected-only runs keep the hooks fast.
