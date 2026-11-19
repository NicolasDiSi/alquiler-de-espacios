# Verify: book a room · spec 0003 · updated 2026-11-11

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. This first set covers the thin thread (build plan tasks 1 to 5); tasks 6 to 8 add their steps when they land._

## UI / manual

- [ ] Sign in as Ana (Acme), open `/reservas/nueva`, pick Sala Mar, a weekday within 60 days, 10:00 to 11:00, press "Reservar" → lands on `/?vista=proximas&nueva=<id>` and the row shows Sala Mar, the date as `dd/mm/aaaa`, "10:00 a 11:00", "Ana (Acme)", "Confirmada" → AC-1, AC-2
- [ ] As Beto (Acme) open `/` → Ana's booking is listed too (the company shares one list) → AC-2
- [ ] Sign in as Carla (Globex), book the same room, day and times → the alert "La sala ya está reservada en ese horario..." takes focus, Inicio and Fin are marked invalid and keep their values, the URL stays `/reservas/nueva`, nothing names Acme or Ana → AC-3, AC-4
- [ ] Open `/reservas/nueva` on a weekday before 19:30 → Fecha is today; at 19:30 or later, or on a weekend → the next weekday; room and times are empty → AC-7 (default date only; the calendar and disabled starts come with task 6)
- [ ] Pick Inicio 18:30 → Fin offers only 19:00, 19:30 and 20:00; change Inicio so the chosen Fin no longer fits → Fin is cleared → AC-7
- [ ] Sign in as Operador and open `/` and `/reservas/nueva` → the 403 page on both → AC-12
- [ ] Sign out and open `/reservas/nueva` → redirected to `/ingresar` → AC-12

## Commands

- [ ] `pnpm --filter @espacios/domain test` → every booking rule has its own test, including "Buenos Aires has no daylight saving" and the 60 day horizon (P-7) → AC-5, AC-7
- [ ] `pnpm --filter @espacios/application test` → each reason from `bookRoom` (`not_on_grid`, `outside_hours`, `invalid_range`, `too_short`, `too_long`, `past_date`, `beyond_horizon`, `not_found`, `forbidden`, `conflict`, `busy`) and nothing written on refusal → AC-5
- [ ] `pnpm --filter @espacios/db test` → P-1 (8 companies at once, exactly one success, 7 bare `conflict`), P-2, P-11 (one company double submit gives `created` true and false with one id), and the cross company cursor test → AC-4, AC-6, AC-12
- [ ] `POST /api/v1/bookings` with a signed cookie (see the script pattern in `apps/web/e2e/session.ts`): new slot → 201 with `Location`; the same body again → 200 with the same id; the same slot from Globex → 409 `conflict`; `10:15` start → 422 `not_on_grid`; 5 hours → 422 `too_long`; a 2020 date → 422 `past_date`; no offset → 400 `invalid_input`; `roomId: "room-x"` → 404 `not_found`; as Operador → 403; `Origin: http://evil.example` → 403 → AC-5, AC-12
- [ ] `GET /api/v1/bookings?view=upcoming&limit=1` → one booking and a `nextCursor`; that cursor with `view=past` → 400; `view=all` → 400; Globex with Acme's cursor → only Globex rows, no "Acme" anywhere in the body → AC-12, AC-14
- [ ] `pnpm check:ai --gate=e2e` → `e2e/bookings.spec.ts` passes (book and see it, conflict from a second company keeps the values, operator 403, signed out redirect and 401) → AC-1, AC-3, AC-4, AC-12

## Value sourcing

- [ ] Company id: book through the API as Ana while sending `"tenantId": "company-globex"` in the body → the booking is stored under Acme (the body field is ignored)
- [ ] `booked_by`: book as Beto (Acme) → "Reservada por" shows Beto, not Ana
- [ ] `startsAt` and `endsAt`: book 10:00 to 11:00 in the form → the API answer shows `T10:00:00-03:00` and the database row is `13:00 UTC`
- [ ] Rule limits: 19:30 to 20:00 is accepted, 19:30 to 20:30 is refused `outside_hours`; day 60 accepted, day 61 `beyond_horizon` (local days)
- [ ] "Now": a start equal to the current half hour mark already passed is refused `past_date`
- [ ] Room exists: an unknown `roomId` in the form (edit the select's value in devtools) → the alert with `not_found` and Sala marked
- [ ] 201 versus 200: the second identical request returns the same id with 200
- [ ] Refusal message: every alert text equals `messages/es.json` `errors.<reason>`
- [ ] Values kept and fields marked on failure: after any refusal the four values remain and the fields of the "Field marks per reason" table carry `aria-invalid`
- [ ] Posted date: the date input posts `YYYY-MM-DD`; an emptied date posts `""` and answers `invalid_input` with Fecha marked
- [ ] Room options: the select lists the rooms of `GET /api/v1/rooms`, "Sala Mar · 16 personas"
- [ ] Default date: matches `nextOpenDay(now)` in Buenos Aires (try a browser in another time zone: the default does not change)
- [ ] Start and end options: Inicio 08:00 to 19:30; Fin from Inicio + 30 minutes to min(Inicio + 4 hours, 20:00)
- [ ] Which bookings: Próximas shows only confirmed, not ended bookings of the signed in company, in start order
- [ ] `phase`: a booking in progress shows "En curso" (seed one that started before now)
- [ ] Room name, booked by name: come from the joins, never a company name
- [ ] Dates and times shown: in `es-AR` and Buenos Aires time, also from a browser set to another time zone

## Full form, full list and e2e (tasks 6 to 8, added 2026-11-11)

- [ ] On `/reservas/nueva`, open the calendar with the button next to Fecha, move with the arrows and press Enter → the typed field shows `dd/mm/aaaa`, the popover closes and focus returns to the button; Esc closes without a change → AC-7
- [ ] In the calendar, past days, Saturdays, Sundays and days beyond 60 days are disabled, and the hint "Se reserva de lunes a viernes, hasta 60 días adelante." is visible → AC-7
- [ ] With today selected after 10:00, the passed starts are disabled; switching to today with a passed start chosen clears Inicio and Fin → AC-7
- [ ] Type `31/02/2030` in Fecha and submit → the alert `invalid_input`, Fecha marked invalid → AC-3
- [ ] Open `/reservas/nueva?sala=room-mar&fecha=<weekday>&inicio=10:00&fin=11:30` → all four fields filled; with `sala=room-nope`, `inicio=10:15` or a Saturday, that field falls back to its default → AC-8
- [ ] Open the form, delete the session cookie in devtools, submit → the alert takes focus with "Elegir usuario de nuevo" linking to `/ingresar`, values kept → AC-9
- [ ] `busy`: hold a conflicting insert open in `psql` (see P-9) and submit the same slot → the alert with "Reintentar", which resubmits the same values → AC-9
- [ ] Book from the form → "Reserva confirmada" toast, the row shows the "Nueva" badge, the address loses `nueva`, and a reload shows neither → AC-1
- [ ] `/` shows the tabs Próximas, Pasadas, Canceladas as links, the current one with `aria-current="page"`; Pasadas shows "Finalizada" rows most recent first; Canceladas adds the "Cancelada el" column → AC-2
- [ ] Each view with no bookings shows its own empty state; Próximas offers "Nueva reserva", and the header always does → AC-11
- [ ] As Diego (Initech) with more than 50 upcoming bookings: 50 rows, "Ver más" loads the rest, then "No hay más reservas"; with the network offline, "Ver más" shows "No pudimos cargar más reservas." with "Reintentar" and keeps the rows → AC-10
- [ ] At 390 px wide each booking is a card, no horizontal scroll; at 768 px and up a table with a caption and column headers → AC-13
- [ ] As Operador, `curl -i` (or devtools) on `/` and `/reservas/nueva` → status 403, not 200 → AC-12
- [ ] `pnpm check:ai` → every gate passes; the e2e gate runs `bookings.spec.ts`, `my-bookings.spec.ts` and the axe checks of both screens in light and dark, compact and comfortable → AC-1 to AC-14

## Acceptance criteria coverage

- AC-1: UI step 1, toast and badge step, e2e `my-bookings.spec.ts`
- AC-2: UI steps 1 and 2, the views step, `db` view tests
- AC-3: UI step 3, the unreadable date step, e2e
- AC-4: UI step 3, `db` P-1, API 409
- AC-5: domain, application and API steps
- AC-6: `db` P-1 and P-11
- AC-7: UI steps 4 and 5, the calendar steps, e2e keyboard and weekend tests
- AC-8: the prefill step, e2e
- AC-9: the expired session step (e2e) and the `busy` step (manual)
- AC-10: the Ver más step, e2e
- AC-11: the empty state step
- AC-12: UI steps 6 and 7, the 403 status step, cursor test, API steps, e2e
- AC-13: the phone and table step, axe in e2e
- AC-14: `GET` API step, e2e
