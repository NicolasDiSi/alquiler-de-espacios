---
name: bff-edges
description: Shape and test the Backend for Frontend edges of alquiler-de-espacios (the client company edge and the operator edge in apps/web). Use when adding or changing a page that reads data, a Route Handler, a view DTO, a list or pagination, a query port, or when a screen is slow, over fetches or issues many queries.
---

# BFF edges

A Backend for Frontend (BFF) is a thin layer that serves one kind of client with exactly the data and shape it needs. `apps/web` holds two of them.

| Edge | Client | Who is acting | Sees |
| ---- | ------ | ------------- | ---- |
| Company edge | A client company's user | `getActor()`, resolved on the server to one company | Rooms, room availability as busy slots (never who booked), its own bookings |
| Operator edge | The rental company's staff | `getActor()` with the operator role | Every company's activity and the utilization metrics |

The business rules never live in an edge. The edge only translates between a client and the use cases. Read `architecture-boundaries` first if you are unsure which layer a piece of code belongs to.

## The idea in one picture

```
Company   ──> Server Component ──> getActor() ──> getRoomAvailability(query port) ──> BusySlotView[]
Company   ──> Server Action bookRoom ──> parse BookRoomInput ──> bookRoom(use case) ──> BookingView | { code: "conflict", ... }
Operator  ──> Server Component ──> getActor() ──> getUtilization(query port, period) ──> UtilizationView
```

Model the write side for correctness (domain, tenancy, overlap constraint) and never bend it for a screen. Make a screen fast on the read side: one query shaped like the screen, indexed for that query, paginated.

## Rules

1. **An edge is thin.** It parses input, gets the actor, calls one use case or query port, and maps the result to a view. No overlap checks, no permission decisions, no metric formulas.
2. **One edge per client.** The company and operator edges never share a handler, and neither exposes a generic "give me anything" endpoint.
3. **Writes go through use cases only.** An edge never writes through a repository or Prisma.
4. **Reads go through query ports** in `packages/application/src/ports/queries/<screen-need>.ts`, named for the need (`listMyBookings`, `getRoomAvailability`, `getUtilizationByCompany`), returning a view DTO. Implement them in `packages/db`. Pages never import `@espacios/db` or Prisma (only `src/composition` may).
5. **Return what the screen shows, nothing more.** Never return a domain entity or a Prisma model. Availability for a company returns time ranges only, never another company's name or booking id.
6. **Inputs are Zod schemas at the edge, outputs are the use case's views.** Request schemas live in `apps/web/src/lib/<edge>/` and their types are inferred from them; responses are the view types `packages/application` returns, shared by the Route Handler and its `fetch` caller. There is no `packages/contracts`: with `apps/web` as the only consumer, published together with the API, a type change already fails `typecheck` (spec 0001 rationale). Extract the schemas to a package when a second client appears.
7. **Tenant and actor come from the server.** Never trust a company id sent in a body, query or header without checking it against the current identity.
8. **Lists are paginated with a keyset, with a hard maximum.** Order by a stable pair such as `(startsAt desc, id desc)` and pass a cursor. Default page 25, maximum 100.
9. **No N+1.** A screen section costs a fixed number of queries no matter how many rows it shows.
10. **Every list query has an index built for it.** Tenant column first, then the filter and sort columns.
11. **Metrics are computed in SQL over a bounded period**, not by loading every booking into memory.
12. **Errors have one shape.** `{ code, message }` with a stable `code` (`validation_failed`, `not_found`, `conflict`, `forbidden`). Status codes: 400 bad input, 401 no actor, 404 not found or other company's id (never 403 for a cross company id, so existence does not leak), 409 conflict. No stack traces.

## How to test compliance

1. **Boundary rules (`pnpm check:ai --gate=boundaries`).** Files under `apps/web/src/app/**` and `apps/web/src/components/**` may not import `@espacios/db` or `@prisma/client`.
2. **Contract tests on every handler or action.** Bad input gives `validation_failed`; another company's id gives `not_found`; a valid call returns the use case's view.
3. **Query budget tests (testcontainers).** Assert the query count is the same for 5 rows and for 500 rows, and that list queries use the expected index.

## Smells

- A page or handler imports Prisma, `@espacios/db` or a repository.
- A handler returns a Prisma model or a domain entity as JSON.
- A loop with an `await` on a query inside it.
- A `companyId` read from the request body.
- An `if (booking.status === ...)` in a handler or component.
