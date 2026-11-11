---
name: nextjs-server-client
description: Choose between Server Components, Client Components, Server Actions, Route Handlers and "use cache" in the alquiler-de-espacios web app (Next.js 16). Use when creating or changing a page, layout, component, form, mutation, API endpoint, or anything cached in apps/web.
---

# Server vs Client in the web app

The web app's own conventions are in `apps/web/AGENTS.md`. Before using a Next.js API, read its guide in `apps/web/node_modules/next/dist/docs/`, because Next 16 differs from older versions.

## Decision table

| Need | Use | Notes |
| --- | --- | --- |
| Show data | Server Component page or section | Read through an `application` query with the current actor. Wrap slow sections in `<Suspense>` with a skeleton that matches the final layout. |
| Interactivity (state, effects, browser APIs) | Client Component leaf | Keep the server parent. Pass server-rendered content as `children`. |
| Mutation from our own UI (book, cancel) | Server Action in `_actions/` next to the route | Steps: Zod parse → `getActor()` → use case → `updateTag(...)` → typed result. UI: `useActionState`. |
| Called by anything that is not our React UI (a documented REST API, tests, scripts) | Route Handler | Versioned path (`/api/v1/...`), Zod parse, explicit cache headers, an `Idempotency-Key` for creates. |
| Reusable read that is the same for everyone in a company | `"use cache"`, `cacheLife` and `cacheTag("<entity>:<id>")` | Pass `tenantId` as an argument. Never read cookies or headers inside the cached scope. Availability changes often: cache it only with a tag invalidated on every booking change. |

## Checklist for a Server Action

- **Location:** the file starts with `"use server"` and lives in the route's `_actions/`.
- **Input:** the input schema comes from `@espacios/contracts` or a local Zod schema. Never trust `FormData` shape.
- **Authorization:** the use case checks the policy. The action does not re-implement it.
- **Results:** return `{ ok: true, data } | { ok: false, error }`, where `error` carries the reason the UI shows ("the room is already booked from 10:00 to 11:00"). Throw only for unexpected failures.
- **Cache:** invalidate with `updateTag` for read-your-own-writes, using the same tag names the reads use.

## Anti-patterns

- `"use client"` on a page or layout "because one button needs state". Extract the button instead.
- Fetching your own Route Handler from a Server Component. Call the query directly.
- `useEffect` used to load data on mount. Render it on the server or stream it.
- Reading `cookies()` or `headers()` in a layout. It makes every route below it dynamic. Read them in the leaf that needs them.
