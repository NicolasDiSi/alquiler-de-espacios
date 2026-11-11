# Verify: database foundation · spec 0001 · updated 2026-11-11

_Steps derived from spec 0001 ("Required proofs" and the scope's "Done when" for feature 2). `/check verify` runs these; `/test` locks the durable ones. Later features append their own sections below._

## Database foundation (feature 2)

### Commands

- [x] `pnpm --filter @espacios/db test` → all tests pass against a throwaway Postgres (Docker running) → P-1, P-2, P-3, P-5, P-13, P-15
- [x] `docker compose down -v && pnpm services:up && pnpm db:deploy` → "All migrations have been successfully applied", run as `espacios_owner` (not a superuser) → scope "migration run as the owner" (run on a throwaway container with the same image and init SQL, port 5433, so the local volume stayed intact)
- [x] As `espacios_owner`: `select relforcerowsecurity from pg_class where relname = 'booking'` → `t` → P-3
- [x] `pnpm db:seed` twice, then as `espacios_operator`: count of `booking`, `room`, `company`, `app_user` → the same numbers after both runs (about 40 bookings with some cancelled, 3 rooms, 3 companies, 5 users) → P-13
- [x] As `espacios_app` with no tenant set: `select count(*) from booking` → `0` (fails closed) → P-3
- [x] As `espacios_owner` with no tenant set: `select count(*) from booking` → `0` (`FORCE` applies to the owner) → P-3
- [x] As `espacios_app` inside a transaction with `set_config('app.tenant_id', 'company-acme', true)`: bookings returned all have `tenant_id = 'company-acme'` → P-3
- [x] As `espacios_app`: `update room set capacity = 1` → permission denied → shared tables are read only for companies
- [x] As `espacios_operator`: `delete from booking` → permission denied; `select` on every table works → P-5
- [x] As `espacios_app`, two companies insert the same room with ranges 10:00 to 12:00 and 11:00 to 13:00 → the second fails with SQLSTATE `23P01`; 10:00 to 11:00 then 11:00 to 12:00 both succeed → P-2
- [x] N parallel inserts of one room and range from different companies → exactly one row, the others fail with `23P01` and the error text names no other company → P-1
- [x] `room_busy_intervals(room, from, to)` as `espacios_app` → returns only start and end of other companies' confirmed bookings, nothing for cancelled ones → P-4 (database part)
- [x] `schema-drift.test.ts` → `prisma migrate diff` between migrations and `schema.prisma` is empty → P-15
- [x] README "Local database" section mentions `docker compose down -v` after a roles change → scope "Done when"

### Value sourcing covered here

- [x] Tenant for every company query comes only from `app.tenant_id` set inside the transaction (vary the tenant: `company-acme` against another company sees disjoint rows) → Value sourcing, "current company id" (database side; the cookie side is feature 3)
- [x] Seeds: rooms, companies, users and demo bookings come from `pnpm db:seed` and follow the booking rules (weekdays, 08:00 to 20:00 Buenos Aires, 30 minute grid, at most 4 hours) → Value sourcing, "Seeds"

### Acceptance coverage

- Migration as the owner: deploy step · Isolation as `espacios_app`: P-3 steps · Overlap: P-1, P-2 steps · Seed twice under `FORCE`: P-13 step · README note: last command step
- Not covered here (later features): P-6, P-7, P-9 (error contract, domain rules), P-4 endpoint and `mine` flag (feature 6), P-8 (feature 8), P-10 (feature 11), P-11 and P-12 (features 5 and 7), P-14 (feature 3)

## Company identity (feature 3)

_Also covers spec 0002 (the picker screen, assumed). AC numbers are spec 0002's; P-14 is spec 0001's cookie proof. Setup: `.env.local` at the repo root with `SESSION_SECRET` (`openssl rand -hex 32`), `pnpm services:up && pnpm db:deploy && pnpm db:seed`, then `pnpm dev`._

### UI / manual

- [x] Signed out, open `http://localhost:3000/` → redirected to `/ingresar`, which lists Acme SA, Globex SRL and Initech SA with their users, and the operator in its own card → AC-2, AC-1
- [x] Click "Entrar como Ana (Acme)" → lands on `/` ("Mis reservas"), header shows "Ana (Acme)" and "Acme SA"; devtools shows `espacios_session` as httpOnly, SameSite Lax, not Secure over http, value `user-acme-ana.<expiresAt>.<signature>` → AC-1, P-14
- [x] As Ana, open `/operador` → 403 page; "Ir a mi inicio" goes back to `/` → AC-3
- [x] "Cambiar de usuario" → back on `/ingresar`, cookie gone; opening `/` redirects again → AC-1
- [x] Click "Entrar como Operador" → lands on `/operador`; opening `/` gives the 403 page and "Ir a mi inicio" goes to `/operador` → AC-3
- [x] As Ana, edit the cookie value in devtools (change `acme-ana` to `globex-carla`) and reload → redirected to `/ingresar`, never signed in as Carla → AC-2, AC-4
- [x] Sign in as Carla (Globex) → header shows Globex SRL: the company follows the picked user's row, nothing else → AC-4

### Commands

- [x] `curl -i http://localhost:3000/api/v1/rooms` → `401` with `{"code":"unauthenticated","message":"…"}` → AC-2, P-14
- [x] `curl -i -b "espacios_session=user-acme-ana.9999999999.forged" http://localhost:3000/api/v1/rooms` → `401` (bad signature) → AC-2, P-14
- [x] Copy a real cookie from the browser and `curl -b "espacios_session=<value>" …/api/v1/rooms` → `200` with the three rooms (id, name, capacity only) → AC-1
- [ ] `SESSION_SECRET=short pnpm dev`, open `/` → fails with "SESSION_SECRET must be at least 32 bytes"; the `.env.example` placeholder is refused the same way → P-14 _(verify 2026-11-11: the key is refused with that message, but only when a cookie is first read or set (500); the server boots and `/` without a cookie still redirects to the picker. Left unticked: the expected result above does not match.)_
- [x] `pnpm --filter @espacios/web test` → token (expired, tampered, swapped user, pushed expiry, other key), Origin (absent allowed, other port refused) and edge access (401, 403) unit tests pass → AC-2, AC-3, P-14
- [x] `pnpm --filter @espacios/db test` → `user-directory.test.ts` and `room-catalog.test.ts` pass as `espacios_app` with no tenant set → AC-4
- [x] `pnpm check:ai --gate=e2e` → `identity.spec.ts` (picker, 4 bad cookie cases, both 403s, switch user) and the axe checks on `/ingresar`, `/operador` and the 403 page pass → AC-1 to AC-4

### Value sourcing

- [x] Current company id: sign in as Ana then as Carla and compare the header company; tamper the user inside the cookie and confirm it is refused, not switched → the company comes from `app_user.tenant_id` of the cookie's user (spec 0001 Value sourcing, "Any company action")
- [x] Session cookie value: an expired value (expiry in the past, correctly signed) gets 401 even though the browser still sends it → `userId.expiresAt.signature` (spec 0001 Value sourcing, "Session")

### Acceptance criteria coverage

- AC-1 picker sets a signed cookie and lands on the role's home: manual 1, 2, 4, 5 · curl 3 · e2e
- AC-2 tampered, expired or unknown cookie is signed out: manual 1, 6 · curl 1, 2 · unit token tests · e2e bad cookie cases
- AC-3 member blocked from operator routes and the reverse (403): manual 3, 5 · unit access tests · e2e
- AC-4 company comes from the cookie's user: manual 6, 7 · db directory tests · value sourcing step 1
- P-14 (spec 0001): bad signature, expired, unknown user 401; mismatched Origin refused and absent Origin allowed (unit, `origin.test.ts` and `access.test.ts`; no POST Route Handler exists yet); `Secure` only over https (manual 2 shows it off over http; the https case is not exercised yet)
