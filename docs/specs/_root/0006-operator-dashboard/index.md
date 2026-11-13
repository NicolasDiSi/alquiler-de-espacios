# 0006 · Operator dashboard

**Status**: Accepted (ratified 2026-11-13)
**Date**: 2026-11-12
**Authorized by**: Nicolas Di si, during /develop

## Owed decision

What the operator dashboard (scope feature 9) shows and where each number comes from. The engineer brought a visual template (`apps/web/src/app/(app)/operador/panel/`, static demo data) and asked to keep its metrics and wire it to the metrics API of spec 0004. Several values in the template have no source in the API or the database, and the 90 day daily chart needs a series the API did not have.

## Assumption built on

**Where it lives.** The dashboard replaces the `/operador` placeholder (the sidebar "Panel" entry and the operator landing of spec 0002 already point there). The template folder `operador/panel/` is removed once its parts move under `operador/`.

**How it reads.** The page is a Server Component that calls the same use cases as `/api/v1/operator/metrics/*` (`getRoomMetrics`, `getCompanyMetrics`, `getHeatmap`, `getInsights` and the new `getDailyMetrics`) through `operatorReadEdge()`. It never fetches its own Route Handler (`nextjs-server-client` skill). Only the active period is read: the period lives in `?period=` (`7d`, `30d` default, `90d`) and the server reads it, so a load runs seven queries in parallel, not one set per period.

**Periods.** "Last N days" are the N complete local days that end yesterday, in the app zone (`America/Argentina/Buenos_Aires`, spec 0001). The comparison window is the N days right before it.

**New endpoint.** `GET /api/v1/operator/metrics/daily?from&to&facilityId?&roomId?` answers `{ days: [{ date, openMinutes, bookedMinutes, occupancy }] }`, one row per local day of the range, with the same definitions as `/metrics/rooms` (open minutes less blocked time, confirmed bookings by the local day they start, a day with no open minutes is `occupancy: null`). Same rules as the other metrics: operator only, 400 for an unreal day, 422 `invalid_range`, 404 for an unknown facility or room.

**Value sourcing.**

| On screen                                 | Source                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Ocupación general, Horas disponibles      | `getRoomMetrics(...).overall` (occupancy, openMinutes)                                                                     |
| Horas reservadas                          | `overall.bookedMinutes / 60`                                                                                               |
| Promedio diario                           | booked hours over the days of the period with open minutes (`getDailyMetrics`)                                             |
| Reservas confirmadas, Canceladas          | sum of `confirmedCount` and `cancelledCount` of `getCompanyMetrics`                                                        |
| Reservas por día (Promedio diario)        | confirmed bookings over the days of the period with open minutes                                                           |
| Duración media                            | booked hours over confirmed bookings                                                                                       |
| Tasa de cancelación                       | `cancellationRateOf(confirmed, cancelled)` (domain) over those sums                                                        |
| Every delta                               | the same figure over the previous window: points for rates, relative change for counts                                     |
| Ocupación diaria (90 days) and 5 day mean | `getDailyMetrics` over the 90 days that end yesterday, open days only; the selected period is shaded                       |
| Heatmap, peak and low                     | `getHeatmap` (all facilities); a `null` cell shows a dash                                                                  |
| Uso por sala                              | `getRoomMetrics(...).rooms`, rooms with open minutes in the period; the tooltip names the facility                         |
| Alta demanda / Baja demanda               | occupancy from 0.8 (template) / under `INSIGHT_THRESHOLDS.lowOccupancy` (0.2, spec 0004)                                   |
| Consumo por empresa                       | `getCompanyMetrics`, every company with its position by hours: search by name, filter by kind and state, sort, 10 per page |
| Recomendaciones                           | `getInsights`: promotion candidates (by reason) and low utilization slots, linking to the client or sede                   |

**Removed from the template** (no source; the scope lists check in, plans and waitlist as future data model growth): the 65% occupancy goal and its lines, attendance and no shows, reassigned cancellations, room floor and type ("salas de directorio"), company plans and plan usage, the export menu, and the recommendation texts written by hand. "Uso del plan" becomes "Participación" (share of booked hours) and "Asistencia" becomes "Cancelación".

**Consumo por empresa is a full list, not a top five** (engineer's request, 2026-11-12): every company of the period on the shared `data-table` (search, kind and state filters, sorting, pages of 10), so idle and inactive clients can be found too. It takes the full width, and the recommendations move under it as a grid. The "these five accounts hold X%" footer is gone with the top five.

**Empty values** show a dash (`—`), never 0%.

## Code area

- `packages/application/src/ports/operator-queries.ts`, `packages/application/src/use-cases/operator-metrics.ts`
- `packages/db/src/operator-queries.ts`, `packages/db/src/operator-metrics.test.ts`
- `apps/web/src/app/api/v1/operator/metrics/daily/`, `apps/web/src/lib/operator/schemas.ts`, `docs/api/operator.md`
- `apps/web/src/app/(app)/operador/` (page and `_dashboard/`), `apps/web/src/components/charts/`, `apps/web/messages/es.json`

## Requirements

Seeds carried from the scope "Done when" of feature 9:
- **AC-1**: The operator sees occupancy, company usage and the heatmap for a chosen period (7, 30 or 90 days).
- **AC-2**: Idle clients (promotion candidates) and cells under 20% stand out.
- **AC-3**: Empty values show a dash.
- **AC-4**: A company user cannot open it (403).
- **AC-5**: `GET /metrics/daily` returns one row per local day with the definitions of `/metrics/rooms`, proven on the hand computed dataset.

## Ratify

Decided during /develop and ratified as built on 2026-11-13.
