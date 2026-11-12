# alquiler-de-espacios

Meeting room booking platform for client companies, with utilization metrics for the operator. Technical challenge for Fontanella SRL.

> **Notice:** © 2026 Nicolas Disi. All rights reserved. This repository is shared only so the recipient can evaluate my application. No use, copying or derivative works without my written permission. See [LICENSE](LICENSE).

The run instructions, architecture decisions, assumptions and the AI usage section will be added here as the project is built. The brief is transcribed in [docs/challenge.md](docs/challenge.md).

## Local database

Requires Docker, Node 24 and pnpm.

```bash
pnpm install
cp .env.example .env.local
# In .env.local, replace SESSION_SECRET with your own key: openssl rand -hex 32
```

## Run the app

```bash
pnpm dev           # starts everything, then http://localhost:3000
```

`pnpm dev` runs these steps in order, so one command is enough every time (Docker must be running):

```bash
pnpm services:up   # PostgreSQL 17 on localhost:5432; creates the database roles on first start
pnpm db:deploy     # apply migrations as the schema owner
pnpm db:seed       # 3 rooms, 3 companies, their users, one operator and about 40 bookings (safe to run twice)
pnpm dev:app       # only the web app, when the database is already up
```

`pnpm services:down` stops the database and keeps its data.

Open the app and pick a seeded user on `/ingresar` ("sign in as"). There are no passwords: this stands in for authentication, it is not authentication. Members of a company land on their bookings, the operator on `/operador`. The app refuses to sign anyone in while `SESSION_SECRET` is missing, shorter than 32 bytes or still the `.env.example` placeholder.

> **After pulling a change to the database roles** (`infra/local/postgres/`), recreate the local database once with `docker compose down -v`, then run the steps above again. Postgres runs those init scripts only when its volume is new. This deletes your local data.

Prisma Studio (`pnpm db:studio`) connects as the schema owner, and row level security applies to it too, so it shows no bookings. To browse every company, read only: `DATABASE_OWNER_URL=postgresql://espacios_operator:espacios_operator@localhost:5432/espacios pnpm db:studio`.

## Supuestos

Business rules the brief leaves open, decided in the specs under `docs/specs/`.

- Every user belongs to a client company, or is the operator. A person who works alone is a client of kind `individual` with one member, so tenant isolation stays one rule.
- A facility (sede) owns the time zone, the opening hours and the open weekdays. Rooms and companies are deactivated, never deleted. A deactivated room or facility never reopens (create a new room instead); a company can be reactivated.
- The operator cannot book or cancel on behalf of a client. Only members write bookings.
- Blocks (maintenance, holidays, private events) cover a room or a whole facility. They are never edited, only released, and companies see them only as "not available".
- Metrics count confirmed bookings only. Occupancy is booked minutes over open minutes inside the room's active window, with blocked time taken out. Facility and overall occupancy are a weighted ratio, never an average of room ratios.
- A metric range is at most 366 days. Each day is read in its facility's time zone.
- A company is a promotion candidate with no confirmed booking in the range, with booked time under 25% of the mean of active companies (needs at least 3 of them), or with a cancellation rate of 0.3 or more over at least 5 bookings.
- Low utilization slots are heatmap cells under 20% occupancy (adjustable), emptiest first, at most 20.
- `lastBookingAt` is when the company last made a confirmed booking, whatever the range.
