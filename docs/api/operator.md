# Operator API (`/api/v1/operator/*`)

The operator's endpoints from [spec 0004](../specs/_root/0004-operator-administration-and-metrics/index.md). Only the operator reaches them. They call the same use cases as the screens and return the same typed result.

## Rules for every endpoint

- **Session.** The signed cookie. No session is `401`. A member is `403`.
- **Writes** (`POST`, `PATCH`) also pass the Origin check and need `Content-Type: application/json`. Unknown keys in a body are refused.
- **Failures** are always `{ "code": "<reason>", "message": "<es-AR text>" }`. `has_future_bookings` and `block_has_bookings` add `details: { total, bookings }` (the first 50 bookings in the way: id, room, company name, start, end). No database error text ever reaches a response.
- **Reads** answer with `Cache-Control: private, no-store`.
- **Nothing is deleted.** Retiring is a `POST .../deactivate`. Rooms and facilities never reopen; a company can be reactivated.
- **Dates.** Instants carry an offset (`2030-01-07T10:00:00-03:00`). Metric ranges are local days (`2030-01-07`).

## Facilities

| Method and path                    | Input                                                                 | Success                           | Failures                                                      |
| ---------------------------------- | --------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `GET /facilities?includeInactive`  |                                                                       | `{ facilities }` with room counts |                                                               |
| `POST /facilities`                 | `name`, `address?`, `timeZone`, `opensAt`, `closesAt`, `openWeekdays` | `201 { facility }` and `Location` | 400 `invalid_input`, 409 `already_exists`                     |
| `GET /facilities/{id}`             |                                                                       | `{ facility }`                    | 404                                                           |
| `PATCH /facilities/{id}`           | any field above                                                       | `{ facility }`                    | 400, 404, 409 `has_future_bookings` (zone, hours or weekdays) |
| `POST /facilities/{id}/deactivate` |                                                                       | `{ facility }`                    | 404, 409 `facility_has_active_rooms`                          |

Hours are minutes from midnight on 30 minute marks (`540` is 09:00), `opensAt < closesAt`, weekdays are 0 Sunday to 6 Saturday.

## Rooms

| Method and path                         | Input                                           | Success                       | Failures                                            |
| --------------------------------------- | ----------------------------------------------- | ----------------------------- | --------------------------------------------------- |
| `GET /rooms?facilityId&includeInactive` |                                                 | `{ rooms }`                   |                                                     |
| `POST /rooms`                           | `facilityId`, `name`, `capacity`, `activeFrom?` | `201 { room }` and `Location` | 400, 404, 409 `already_exists`, `facility_inactive` |
| `GET /rooms/{id}`                       |                                                 | `{ room }`                    | 404                                                 |
| `PATCH /rooms/{id}`                     | `name?`, `capacity?`                            | `{ room }`                    | 400, 404, 409                                       |
| `POST /rooms/{id}/deactivate`           |                                                 | `{ room }`                    | 404, 409 `has_future_bookings` (with the list)      |

`activeFrom` defaults to the creation instant. An earlier value backfills history for the metrics.

## Clients (companies and individuals)

| Method and path                                  | Input                                              | Success                                             | Failures                             |
| ------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| `GET /companies?includeInactive`                 |                                                    | `{ companies }`                                     |                                      |
| `POST /companies`                                | `name`, `slug`, `kind`, `logoUrl?`, `member.name?` | `201 { company }` (the client and its first member) | 400, 409 `already_exists`            |
| `GET /companies/{id}`                            |                                                    | `{ company }`                                       | 404                                  |
| `PATCH /companies/{id}`                          | `name?`, `logoUrl?` (`null` clears it)             | `{ company }`                                       | 400, 404                             |
| `POST /companies/{id}/deactivate`, `/reactivate` |                                                    | `{ company }`                                       | 404                                  |
| `GET /companies/{id}/members`                    |                                                    | `{ members }`                                       | 404                                  |
| `POST /companies/{id}/members`                   | `name`                                             | `201 { member }`                                    | 400, 404, 409 `individual_is_single` |

`kind` is `company` or `individual` and never changes. `slug` never changes. `logoUrl` is an `https` URL of at most 2048 characters. A client is created with its first member. An `individual` holds exactly one member. No role other than `member` can be created.
A deactivated company's members get 403 `company_inactive` when booking, and can still list and cancel.

## Blocks

| Method and path             | Input                                                                                     | Success         | Failures                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /blocks`               | `facilityId`, `roomId`, `includeReleased`                                                 | `{ blocks }`    |                                                                                                                                                                                                                  |
| `POST /blocks`              | `facilityId`, `roomId?` (none: whole facility), `startsAt`, `endsAt`, `reason` (1 to 200) | `201 { block }` | 400, 404, 409 `block_has_bookings` (with the list), 409 `block_overlaps_block` (another active block of the room, or of the whole sede, on that time), `facility_inactive`, `room_inactive`, 422 `invalid_range` |
| `GET /blocks/{id}`          |                                                                                           | `{ block }`     | 404                                                                                                                                                                                                              |
| `POST /blocks/{id}/release` |                                                                                           | `{ block }`     | 404, 409 `already_released`                                                                                                                                                                                      |

Blocks are never edited: release one and create another. Companies never see a block or its reason; availability shows only `kind: "blocked"`.

## Bookings

`GET /bookings` takes `companyId`, `roomId`, `facilityId`, `status`, `from`, `to` (instants, bounding the start: `[from, to)`), `cursor` and `limit` (default 50, at most 100). It answers `{ bookings, nextCursor }`, upcoming first, then past. `nextCursor` is opaque; send it back as `cursor`. A malformed cursor or filter is 400. Each booking's `room` carries its `facilityName` ([spec 0007](../specs/_root/0007-client-detail-activity/index.md)).

## Metrics

Over confirmed bookings only. `from` and `to` are inclusive local days (`YYYY-MM-DD`), each read in the facility's own time zone. An unreal day is 400. `to` before `from`, or a range over 366 days, is 422 `invalid_range`. A zero denominator is `null`, never 0.

| Endpoint                                                            | Answers                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /metrics/rooms?from&to`                                        | `{ rooms, facilities, overall }`. Each has `openMinutes`, `bookedMinutes`, `occupancy` (rooms add `blockedMinutes`).                                                                                                                                                            |
| `GET /metrics/companies?from&to&kind?`                              | `{ companies }`: `kind`, `active`, `bookedMinutes`, `bookedHours`, `confirmedCount`, `cancelledCount`, `cancellationRate`, `share`, `lastBookingAt`. Idle and inactive clients included, most booked first.                                                                     |
| `GET /metrics/heatmap?from&to&facilityId?&roomId?`                  | `{ cells: [{ weekday, hour, occupancy }] }`. A booking is split across the hour cells it touches. A cell where no room was open is `null`. 404 for an unknown facility or room.                                                                                                 |
| `GET /metrics/daily?from&to&facilityId?&roomId?`                    | `{ days: [{ date, openMinutes, bookedMinutes, occupancy }] }`, one row per local day of the range ([spec 0006](../specs/_root/0006-operator-dashboard/index.md)). Same definitions as `/metrics/rooms`; a closed day is `occupancy: null`. 404 for an unknown facility or room. |
| `GET /metrics/insights?from&to&lowOccupancy?` (default 0.2, 0 to 1) | `{ lowUtilizationSlots, promotionCandidates }`. Slots: facility, weekday, hour, occupancy, emptiest first, at most 20. Candidates: company, `reasons`, and the numbers behind them.                                                                                             |

**Definitions.**
- Open minutes of a room: the facility's opening window on each open weekday of the range, inside the room's active window (`activeFrom` to `deactivatedAt`), minus blocked time (a released block counts only until its release). Blocked time leaves the denominator, so it does not lower occupancy.
- Facility and overall occupancy are booked minutes over open minutes summed, never an average of room ratios.
- Cancellation rate is `cancelled / (confirmed + cancelled)`.
- Promotion reasons: `no_bookings` (no confirmed booking in the range), `low_usage` (booked time under 25% of the mean of active companies, with at least 3 of them), `high_cancellation` (rate of 0.3 or more over at least 5 bookings). Only active companies qualify.
