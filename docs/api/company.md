# Company API (`/api/v1/*`)

The client company's endpoints from [spec 0001](../specs/_root/0001-booking-platform-architecture/index.md), extended by [spec 0003](../specs/_root/0003-booking-form-my-bookings/index.md) and [spec 0008](../specs/_root/0008-room-availability-screens/index.md). They call the same use cases as the screens' Server Actions and return the same typed result. The operator's endpoints are in [operator.md](operator.md).

## Rules for every endpoint

- **Session.** The signed cookie from "Ingresar". No session, or a forged or expired one, is `401`. The operator is `403` on member endpoints.
- **The company comes from the session, never from the request.** A `companyId` or `tenantId` in a body or query is ignored; there is no way to act for another company.
- **Writes** (`POST`) also pass the Origin check (cross origin is `403`) and need `Content-Type: application/json` (otherwise `400`).
- **Failures** are always `{ "code": "<reason>", "message": "<es-AR text>" }` with the reason's status (`apps/web/src/lib/result/http.ts`). No database error text ever reaches a response. `busy` (`503`) adds `Retry-After: 1`.
- **Responses** carry `Cache-Control: private, no-store`.
- **Dates.** Instants carry an offset (`2030-01-07T10:00:00-03:00`). Days are local to the room's sede (`2030-01-07`).

## Rooms

| Method and path                | Who    | Input                                                    | Success                                                   | Failures                      |
| ------------------------------ | ------ | -------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- |
| `GET /rooms`                   | any    |                                                          | `{ rooms }` (id, name, capacity)                          |                               |
| `GET /rooms/{id}/availability` | member | `from`, `to` (local days, at most 42), or `date` for one | the room, each day's hours and busy time (`kind`, `mine`) | 400, 404, 422 `invalid_range` |

Busy time never says whose it is: another company's booking is only `{ kind: "booked", mine: false }`.

## Bookings

| Method and path              | Input                                                                                             | Success                                                               | Failures                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /bookings`             | `roomId`, `startsAt`, `endsAt`                                                                    | `201 { booking, message }` and `Location`; `200` for the exact repeat | 400 `invalid_input`, 404, 409 `conflict`, `room_inactive`, `room_blocked`, 403 `company_inactive`, 422 `invalid_range`, `too_short`, `too_long`, `not_on_grid`, `outside_hours`, `past_date`, `beyond_horizon`, 503 `busy` |
| `GET /bookings`              | `view` (`upcoming`, `past`, `cancelled`; default `upcoming`), `cursor`, `limit` (50, at most 100) | `{ bookings, nextCursor }`                                            | 400 for an unknown view, a malformed cursor or one from another view                                                                                                                                                       |
| `POST /bookings/{id}/cancel` |                                                                                                   | `{ booking, message }`                                                | 404 (unknown, or another company's), 409 `already_cancelled`, 422 `cancel_not_allowed` (it started)                                                                                                                        |

A `conflict` never says who holds the time. Any member of the company may cancel its bookings, not only the one who booked.

## How this is tested

`apps/web/src/app/api/v1/routes.test.ts` checks every route file against these rules (each handler authenticates, member routes read no company id, every operator route is in `operator.md`). `apps/web/src/app/api/v1/handlers.test.ts` calls the handlers with real requests and signed cookies. What the use cases and the database do behind them is proven against Postgres in `packages/db`.
