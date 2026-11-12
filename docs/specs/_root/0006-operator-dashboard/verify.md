# Verify: operator dashboard · spec 0006 · updated 2026-11-12

_Steps derived from spec 0006 acceptance criteria and its value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Sign in as Operador → land on `/operador` with the heading "Panel del operador", the period set to 30 días and its dates beside it → AC-1
- [ ] Click 7 días, then 90 días → the URL becomes `?periodo=7d` / `?periodo=90d`, the dates and every card change, the shaded zone of the daily chart matches the period → AC-1
- [ ] Open `/operador?periodo=xyz` → the 30 day view, no error → AC-1
- [ ] The recommendations list the clients with no bookings or low usage and the heatmap slots under 20%, each with a link to the client or the sede that opens it → AC-2
- [ ] A client with no bookings shows a dash in Cancelación, and with no previous data the KPI badge reads "Sin datos previos" (never 0%) → AC-3
- [ ] Heatmap cells where nothing was open show "—" → AC-3
- [ ] Sign in as a company member and open `/operador` → 403 → AC-4
- [ ] Dark mode and the compact density keep the heatmap numbers readable → AC-1

## Value sources (vary the input, check the output)

- [ ] Ocupación general equals `overall.occupancy` of `GET /api/v1/operator/metrics/rooms` for the same `from`/`to` (the period ends yesterday in Buenos Aires) → AC-1
- [ ] Horas reservadas equals `overall.bookedMinutes / 60` of the same call → AC-1
- [ ] Reservas confirmadas and Canceladas equal the sums of `confirmedCount` and `cancelledCount` of `GET /metrics/companies` → AC-1
- [ ] Tasa de cancelación equals cancelled / (confirmed + cancelled) of those sums → AC-1
- [ ] Each delta equals the same figure over the previous window of the same length (points for rates, percent for counts) → AC-1
- [ ] Promedio diario (hours and bookings) divides by the days of the period with open minutes, not by calendar days → AC-1
- [ ] The daily chart shows only open days of the last 90 days and matches `GET /metrics/daily` for that range → AC-5
- [ ] Heatmap values, peak and low match `GET /metrics/heatmap` → AC-1
- [ ] Uso por sala lists only rooms open in the period; "Alta demanda" from 80%, "Baja demanda" under 20% → AC-2
- [ ] Consumo por empresa lists every company, most hours first with its position; search by name, the Tipo and Estado filters and the sort headers narrow and reorder it, and from 11 companies it pages by 10 → AC-1, AC-2
- [ ] Book a room for a company, cancel another, reload → the confirmed, cancelled and rate cards move by one booking (only after the booking day has passed, since the period ends yesterday) → AC-1

## Commands

- [ ] `curl -b <operator cookie> "localhost:3000/api/v1/operator/metrics/daily?from=2026-11-01&to=2026-11-07"` → seven rows, weekends with `openMinutes: 0` and `occupancy: null` → AC-5
- [ ] The same with `to` before `from` → 422 `invalid_range`; with `roomId=nope` → 404; as a member → 403 → AC-5
- [ ] `pnpm --filter @espacios/db exec vitest run src/operator-metrics.test.ts` → the daily usage tests pass on the hand computed dataset → AC-5
- [ ] `pnpm check:ai --gate=e2e --suite=shell` → the axe check on the operator home passes with the dashboard → AC-1

## Acceptance-criteria coverage

- AC-1 · UI steps 1 to 3 and 8, value sources 1 to 7, 9, 10 and 11, the e2e command
- AC-2 · UI step 4, value source 9
- AC-3 · UI steps 5 and 6
- AC-4 · UI step 7
- AC-5 · value source 7, commands 1 to 3
