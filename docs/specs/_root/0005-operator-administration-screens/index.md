# 0005. Operator administration screens

**Date**: 2026-11-12
**Status**: Proposed

## Summary

The operator gets the screens for everything spec 0004 built behind the API: a Sedes page (with a detail page per sede that holds its rooms and its blocks) and a Clientes page (with a detail page per client that holds its members). Every create and edit happens in a dialog, every risky action asks for a confirmation that says what will happen, and when a change is refused because bookings are in the way, the dialog lists those bookings so the operator knows who to call. No database change and no new business rule: the screens call the same use cases as the API.

## Requirements

**User stories**:
- As the operator, I want to add and edit sedes, rooms and clients from the browser, so that I do not need to call the API by hand.
- As the operator, I want to see which bookings stop me from deactivating a room, changing a sede's hours or blocking a room, so that I can fix them and try again.
- As the operator, I want to block a room or a whole sede for a period and release the block later, so that maintenance and holidays never collide with bookings.
- As the operator, I want to register a person who works alone and add members to a company, so that every client books the same way.
- As the operator, I want a clear reason whenever something fails, so that I know what to change.
- As a company member, I never see these screens or anything they show (403).

**Acceptance criteria** (the contract; each is checkable on its own):
- **AC-1**: Only the operator opens `/operador/sedes`, `/operador/sedes/[id]`, `/operador/clientes` and `/operador/clientes/[id]`. A member gets 403, a visitor without a session is sent to `/ingresar`. Every Server Action checks the operator again and answers `unauthenticated` or `forbidden` (never trusts that the page was checked).
- **AC-2**: `/operador/sedes` lists sedes in a table (Nombre, Dirección, Zona horaria, Horario as `09:00 a 18:00`, Días as `L M X J V`, Salas activas, Estado) and each name links to its detail. Deactivated sedes are hidden unless the URL has `?desactivadas=1`, which a "Mostrar desactivadas" switch sets; a deactivated row shows a muted "Desactivada" badge with its date. No sedes: an empty state with the "Nueva sede" button.
- **AC-3**: "Nueva sede" and "Editar" open a dialog with Nombre, Dirección (optional), Zona horaria (a select of a short list), Apertura and Cierre (selects on 30 minute marks, `HH:mm`) and Días (a toggle group, Monday first). A refusal keeps the values and marks the fields named in the field marks table. Success closes the dialog, shows a toast and the list shows the change.
- **AC-4**: When a hours, zone or weekday change is refused with `has_future_bookings`, the dialog shows the message, the total, and a table of the bookings in the way (Sala, Empresa, Inicio, Fin; at most 50, as the API returns them), and keeps the form so the operator can adjust and retry.
- **AC-5**: `/operador/sedes/[id]` shows the sede's data, its rooms and its blocks (AC-6 and AC-7), and "Editar" and "Desactivar sede" buttons. Deactivating asks for a confirmation that says the sede never reopens and its history is kept; a refusal with `facility_has_active_rooms` shows its message in the same dialog. A deactivated sede shows its data and history read only (no create, edit or block buttons). An unknown id is a 404 page.
- **AC-6**: The rooms table on the sede detail (Nombre, Capacidad, Disponible desde, Estado) has "Nueva sala" (Nombre, Capacidad from 1, optional "Disponible desde" date, empty means now, with a one line hint that an earlier date backfills the metrics), "Editar" (Nombre and Capacidad only) and "Desactivar" with the same confirmation as AC-5, which lists the future bookings if the API refuses with `has_future_bookings`. Deactivated rooms are hidden unless `?desactivadas=1`.
- **AC-7**: The blocks table on the sede detail (Alcance as `Toda la sede` or the room's name, Desde, Hasta, Motivo, Estado) shows blocks not released by default and releases too with `?liberados=1`. "Nuevo bloqueo" has Alcance (Toda la sede or one active room), Desde and Hasta (a date input plus an `HH:mm` select each, read in the sede's time zone, with the zone named under the fields), a "Todo el día" shortcut that fills the sede's opening hours for the chosen day, and Motivo (1 to 200 characters). A refusal with `block_has_bookings` lists the bookings as in AC-4. "Liberar" asks for a short confirmation and the block then shows as "Liberado". Dates and times shown are in the sede's zone.
- **AC-8**: `/operador/clientes` lists clients (Avatar, Nombre, Código, Tipo as Empresa or Persona, Estado) with the same inactive switch as AC-2 and an empty state. "Nuevo cliente" opens a dialog with a Tipo radio (Empresa or Persona independiente), Nombre, Código (suggested from the name until the operator edits it, with the line that it can never change), Logo (optional https URL) and, for an Empresa only, "Primer miembro" (required). For a Persona the first member is the client's own name. The avatar shows the logo when it loads and the initials otherwise.
- **AC-9**: `/operador/clientes/[id]` shows the client's data (Código and Tipo read only), a members table (Nombre, Alta), "Editar" (Nombre and Logo), "Agregar miembro" (hidden when the client is a Persona that already has its member) and "Desactivar" or "Reactivar" with a confirmation that says what changes (a deactivated client's members cannot book but keep their list and cancel). A refusal with `individual_is_single` shows its message.
- **AC-10**: Every failed action shows the reason's es-AR text in one alert slot at the top of its dialog (role `alert`, receives focus), never a raw error, and marks fields as in the field marks table. `busy` offers "Reintentar" and keeps the values, `unauthenticated` offers a link to `/ingresar`. A button that submits is disabled and says what it is doing while pending, so a double click does not repeat the write.
- **AC-11**: Every operator list and detail page is read on the server at request time and is never cached. After a successful action the affected pages show the new state without a manual reload. Two operators editing the same record get the server's answer (`not_found`, `has_future_bookings`, `already_released`...), never a silent overwrite of a closed record.
- **AC-12**: The operator sees "Sedes" and "Clientes" in the sidebar and as links on `/operador`; a member never sees them. The current entry is marked for screen readers.
- **AC-13**: Tables are real tables with a caption on `md` and wider and turn into cards below `md` (room and time first, as in spec 0003). Dialogs keep the focus inside, return it to the button that opened them, and close with Escape. Every control has a visible label. Axe finds no violations on any of the four pages or their dialogs.
- **AC-14**: Each page has a loading skeleton (`loading.tsx`) and an error state with "Reintentar" (`error.tsx`). A failed read never shows an empty list as if there were no data.

## Decision

**Chosen option**: Option 1: Sedes and Clientes as list plus detail pages, every form in a dialog, writes through one Server Action per form that calls the existing use cases.

The operator edge in `apps/web` gets four pages and a set of dialogs; nothing changes in `domain`, `application` or `db`, except a small addition to the shape of a failed action result (below).

**Implementation skills**: `bff-edges` (local, `.claude/skills/bff-edges/`) · `nextjs-server-client` (local, `.claude/skills/nextjs-server-client/`) · `architecture-boundaries` (local, `.claude/skills/architecture-boundaries/`) · `pattern-catalog` (local, `.claude/skills/pattern-catalog/`) · `data-display-and-selection` (`dembrandt/dembrandt-skills`, `.claude/skills/`) · `ui-density` (`dembrandt/dembrandt-skills`, `.claude/skills/`) · `status-colors-and-errors` (`dembrandt/dembrandt-skills`, `.claude/skills/`) · `accessible-data-tables-and-grids` (`smukh/a11y-agent-skills`, `.claude/skills/`) · `shadcn` (`shadcn/ui`, `.claude/skills/`) · `e2e-patterns` (local, `.claude/skills/`)

**Design source**: the existing UI and design system (decided with the engineer on 2026-11-12): the Studio Admin shell, the `design-system` gallery page and the patterns of spec 0003 (URL driven views, tables that become cards, `EmptyState`, `sonner` toasts, an alert slot above the fields). No Figma file, no screenshots.

## Feature design

**Data model sketch**: no change. The screens read and write `facility`, `room`, `company`, `app_user` (members) and `block` as built in spec 0004. Nothing is deleted anywhere; deactivating and releasing are the only ways out.

**State transitions**: none new. The screens only show the states spec 0004 defined: facility, room and company are active or deactivated (`deactivatedAt`), a block is active or released (`releasedAt`). The displayed state is derived: a block whose `endsAt` has passed and was never released shows "Finalizado" and a released one shows "Liberado".

**Routes** (all in `apps/web/src/app/(app)/operador/`, Spanish names like the rest of the app):

| Route                     | Reads                                                                                     | Query parameters (untrusted, validated with Zod) |
| ------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `/operador/sedes`         | `listFacilities(includeInactive)`, `listRooms(includeInactive: true)` for the room counts | `desactivadas` (`1`)                             |
| `/operador/sedes/[id]`    | `getFacility`, `listRooms({ facilityId })`, `listBlocks({ facilityId, includeReleased })` | `desactivadas`, `liberados`                      |
| `/operador/clientes`      | `listClients(includeInactive)`                                                            | `desactivadas`                                   |
| `/operador/clientes/[id]` | `getClient`, `listMembers`                                                                | none                                             |

The pages call the use cases directly through the composition root's `operatorEdge()`, never through the REST API, so there is no second round trip and no second place for the rules.

**Server Actions** (each in the `_actions/` folder of its page, each takes `FormData`, validates with Zod, checks the operator, calls one use case, returns `ActionResult` and calls `revalidatePath`):

| Action               | Use case             | Inputs                                                                                    |
| -------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `createFacility`     | `createFacility`     | name, address, timeZone, opens, closes, weekdays                                          |
| `updateFacility`     | `updateFacility`     | `id` plus the same fields                                                                 |
| `deactivateFacility` | `deactivateFacility` | `id`                                                                                      |
| `createRoom`         | `createRoom`         | `facilityId`, name, capacity, `activeFrom` date (optional)                                |
| `updateRoom`         | `updateRoom`         | `id`, name, capacity                                                                      |
| `deactivateRoom`     | `deactivateRoom`     | `id`                                                                                      |
| `createBlock`        | `createBlock`        | `facilityId`, `roomId` (empty means the whole sede), from and to (date plus time), reason |
| `releaseBlock`       | `releaseBlock`       | `id`                                                                                      |
| `createClient`       | `createClient`       | kind, name, slug, logoUrl, member name (company only)                                     |
| `updateClient`       | `updateClient`       | `id`, name, logoUrl (empty clears it)                                                     |
| `addMember`          | `addMember`          | `clientId`, name                                                                          |
| `deactivateClient`   | `deactivateClient`   | `id`                                                                                      |
| `reactivateClient`   | `reactivateClient`   | `id`                                                                                      |

**A small contract change.** `ActionResult` (`apps/web/src/lib/result/action-result.ts`) gets an optional `details` on its failure variant, the same `RefusalDetails` the use case's `Result` already carries and `failureResponse` already sends through the API. Without it the two refusals that list bookings (`has_future_bookings`, `block_has_bookings`) could not reach the dialog. `toActionResult` copies `details` when present.

**Field marks per reason** (AC-3, AC-10):

| Dialog  | Reason                                            | Fields marked                                                               |
| ------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| any     | `invalid_input`                                   | the fields in the Zod error paths, or none (alert only)                     |
| Sede    | `already_exists`                                  | Nombre                                                                      |
| Sede    | `has_future_bookings`                             | the four rule fields (Zona horaria, Apertura, Cierre, Días), plus the table |
| Sala    | `already_exists`                                  | Nombre                                                                      |
| Sala    | `facility_inactive`                               | none (alert only)                                                           |
| Bloqueo | `block_has_bookings`                              | none (alert plus the table)                                                 |
| Bloqueo | `invalid_range`, `past_date`                      | Hasta                                                                       |
| Bloqueo | `facility_inactive`, `room_inactive`, `not_found` | none (alert only)                                                           |
| Bloqueo | `already_released` (release dialog)               | none (alert only, the page refreshes)                                       |
| Cliente | `already_exists`                                  | Código                                                                      |
| Miembro | `individual_is_single`                            | none (alert only)                                                           |
| any     | `busy`, `unauthenticated`, `forbidden`            | none (alert only, with the AC-10 actions)                                   |

**Value sourcing** (every value the screens show or send, and where it comes from):

| Action or screen        | Value produced or displayed       | Source                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every page and action   | the operator identity             | the signed cookie through `requireOperator` (pages) and the action variant of the same check (actions)                                                                                                                     |
| Sedes list              | Salas activas per sede            | counted in the page from `listRooms(includeInactive: true)`, grouped by `facilityId` and filtered to `deactivatedAt` null; no new query                                                                                    |
| Sedes list and detail   | Horario `09:00 a 18:00`           | `opensAt` and `closesAt` (minutes from midnight) formatted by a small pure helper in `apps/web/src/lib/operator/`                                                                                                          |
| Sedes list and detail   | Días `L M X J V`                  | `openWeekdays` (0 Sunday to 6 Saturday), shown Monday first, labels from the es-AR catalog                                                                                                                                 |
| Sede dialog             | the zone options                  | a constant list in `apps/web/src/lib/operator/` (Buenos Aires first, the common Latin America zones, UTC); the edit form adds the sede's current zone if it is not in the list. The server accepts any IANA name as before |
| Sede dialog             | Apertura and Cierre options       | every 30 minute mark of the day (`00:00` to `24:00`), converted to minutes on submit; the server applies the rule `opensAt < closesAt`                                                                                     |
| Room dialog             | `activeFrom`                      | the optional date field (read as the start of that day in the sede's zone); empty is omitted so the use case defaults to now                                                                                               |
| Block dialog            | `startsAt` and `endsAt` instants  | the date and `HH:mm` fields converted with the sede's `timeZone` by the zone helper of the domain (spec 0003, Intl only); the sede is read on the server, never taken from the form                                        |
| Block dialog            | "Todo el día" times               | the sede's `opensAt` and `closesAt` for the chosen date (a display shortcut, the server checks the instants)                                                                                                               |
| Blocks table            | the room's name                   | looked up in the page from the rooms of the same sede (`roomId` to name); `null` shows "Toda la sede"                                                                                                                      |
| Blocks table            | the block's displayed state       | derived: `releasedAt` set is "Liberado", `endsAt` before now is "Finalizado", otherwise "Activo" (the clock port of the composition root)                                                                                  |
| Refusal tables          | bookings in the way and the total | `details` of the failed `Result` (spec 0004, AC-5, AC-18), at most 50 rows, shown as received                                                                                                                              |
| Client dialog           | the slug suggestion               | a pure function of the name typed (lowercase, accents removed, spaces to `-`), computed in the browser until the operator edits the field; the server validates the pattern with the same schema as the API                |
| Client dialog           | first member's name               | the field for a company; omitted for a person (the use case then uses the client name, spec 0004 AC-4)                                                                                                                     |
| Clients list and detail | avatar                            | `logoUrl` or the initials of `name`                                                                                                                                                                                        |
| Client detail           | whether "Agregar miembro" shows   | `kind` is `company`, or the members count is zero (display only; the server answers `individual_is_single`)                                                                                                                |
| Dates shown in lists    | local date and time               | the sede's `timeZone` for blocks and the bookings in a refusal; `America/Argentina/Buenos_Aires` from `i18n/config.ts` for `createdAt` columns                                                                             |
| Toasts and alerts       | the text                          | `messages/es.json` (`operator.*` and the existing `errors.*`, one key per reason); no text written in code                                                                                                                 |

**Key invariants**:
- No screen writes without a use case, and no use case is skipped because a button was hidden: hiding is only display.
- A sede, room or client is never deleted from the UI; the only ways out are deactivate and release.
- `slug` and `kind` are shown read only after creation, and the edit form does not send them.
- A block's reason is only shown on these operator pages and never put in a URL, a toast or a log line.
- The list of bookings in a refusal is shown exactly as the use case returned it (no extra query, so what the operator sees is what blocked the change).

**Patterns**:
- Two writes in one action: none new. `createClient` already creates the client and its first member in one transaction (spec 0004).
- A write that must not repeat: the submit button is disabled while pending; a second submit that slips through is harmless because the use cases refuse duplicates (`already_exists`, `already_released`, `individual_is_single`) and every deactivate is refused when repeated.
- A rule two requests can break together: already decided in spec 0004 (row locks and the guard trigger, proofs P-16 to P-18). The screens add no new race.
- Second kind of client: the operator edge has both Server Actions (this spec) and REST (spec 0004), calling the same use cases and returning the same typed result; proof: the e2e checks the message the API documents for the same reason.
- Tenant data: nothing new. The operator login reads every company by design; the member edge never reaches these routes (proof: e2e 403 for a member on each page and each action).
- Cache: none. Pages read cookies, so they render per request and use no `use cache`; `revalidatePath` after each write refreshes the client router cache.
- Call outside the process, history, instant revocation, slow side effect: none fire. The only outside request is the browser loading a client's logo (see Security model).

**Security model**:
- Operator only. Pages use `requireOperator`; Server Actions are public POST endpoints, so each one runs the operator check itself and returns `unauthenticated` or `forbidden` as a typed result, never trusting the page. Next.js checks the Origin of Server Actions.
- Client input is untrusted: the form is parsed with Zod, ids come from hidden fields and are checked by the use case (`not_found` otherwise), and the block's zone comes from the sede read on the server.
- The logo is an arbitrary `https` URL the operator pasted. It renders in a plain `img` with `referrerPolicy="no-referrer"`, empty `alt` and a fallback to the initials; no Next image proxy and no `remotePatterns`. The only cost is that the operator's browser requests that URL; nothing about the app is sent with it.
- A block's reason is internal: shown only in these pages, and the member edge never reads blocks (spec 0004, AC-20).
- No new environment variables, no new compliance scope (names and the client code are business data).

**Configuration required**: none. No new dependency: the dialog, table, switch, select, toggle group, radio group, badge, alert, calendar, popover, skeleton and sidebar already exist in `src/components/ui/`, and `avatar` comes from the `radix-ui` package already installed (add it with the shadcn CLI and check that no new package is pulled in).

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: the operator creates a sede, adds a room, blocks the room for a day and releases the block; each shows in its list and the toast says so, verifies **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-7**.
- Failure with a list: a company books a room, then the operator tries to deactivate the room, to move the sede's closing time before the booking and to block that day; each dialog shows the bookings in the way and keeps its form, verifies **AC-4**, **AC-6**, **AC-7**.
- Clients: create a Persona (one name, no first member field), then try to add a second member and see `individual_is_single`; create an Empresa and add two members, verifies **AC-8**, **AC-9**.
- Failure messages: a duplicate sede name and a duplicate client code mark their field and show their message, verifies **AC-10**.
- Auth: a member gets 403 on the four pages and `forbidden` from an action posted directly; a visitor is sent to `/ingresar`, verifies **AC-1**, **AC-12**.
- States and access: loading, error and not found pages; keyboard only use of a dialog (open, Escape, focus returns); axe on the four pages with a dialog open, verifies **AC-13**, **AC-14**.
- Freshness: after a deactivation the list no longer shows the room without a reload, and `?desactivadas=1` shows it again with its badge, verifies **AC-2**, **AC-11**.

## Build plan

Tracer Bullet: tasks 1 and 2 are one thin real thread (the operator opens Sedes, adds a sede in a dialog and sees it in the list, reached from the sidebar); tasks 3 to 7 thicken it one segment at a time; task 8 proves it end to end.

1. `web` plumbing: the optional `details` on the failed `ActionResult` (with its test), an action variant of the operator check, the shared pieces (a form dialog that holds the alert slot and field marks, a refusal table of affected bookings, a confirm dialog) and the `operator.*` catalog strings, satisfies **AC-1**, **AC-10**, **AC-11**
2. Thin thread: `/operador/sedes` (server read, table, empty state), the `createFacility` action and the "Nueva sede" dialog with the time zone constant and the hours helper; the two operator sidebar entries behind a small server leaf in `Suspense` that reads the role (the layout still reads no cookies), and the links on `/operador`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-12**
3. Sede edit and the hours refusal: `updateFacility`, the edit dialog, the affected bookings table, the inactive switch, satisfies **AC-2**, **AC-3**, **AC-4**
4. Sede detail and rooms: `/operador/sedes/[id]`, rooms table, `createRoom`, `updateRoom`, `deactivateRoom` and `deactivateFacility` with their confirmations, the read only state of a deactivated sede, satisfies **AC-5**, **AC-6**
5. Blocks: the blocks table and its states, `createBlock` with the zone conversion and "Todo el día", `releaseBlock`, the `?liberados=1` switch, satisfies **AC-7**
6. Clientes list: `/operador/clientes`, the `avatar` component, `createClient` with the kind radio, the slug suggestion and the company only first member field, satisfies **AC-8**
7. Client detail: `/operador/clientes/[id]`, members table, `addMember`, `updateClient`, `deactivateClient` and `reactivateClient`, satisfies **AC-9**
8. States, responsive and e2e: `loading.tsx` and `error.tsx` per page, cards below `md`, 404 for an unknown id, and a new Playwright `operator` suite (add it to the suites of `pnpm check:ai`) with axe on the four pages and a dialog open, satisfies **AC-11**, **AC-13**, **AC-14**

## Consequences

**Positive**:
- Every write of spec 0004 has a screen, and the operator never needs the API to run the business.
- The pages and the API share the use cases and the reasons, so a rule changed once changes in both.
- The sede detail matches the data (a room belongs to a sede, a block to a sede or a room), so no form asks for the sede twice.
- A refusal always tells the operator which bookings to deal with, using the answer the API already gives.

**Negative / tradeoffs**:
- A client has no history view (its bookings, hours and cancellations over time): the dashboard table of feature 9 covers "analyze each client" in v1, as the scope already says.
- Zone options are a short list, so a sede in an unusual zone needs the API.
- Sede counts come from reading all rooms once; fine for the size of this product, and revisit if rooms reach the thousands.
- The sidebar entries need the role, which the layout does not read. They come from one small server leaf in `Suspense`, a first step of feature 13's role based navigation that feature 13 will extend instead of redo.
- The logo request goes from the operator's browser to a third party host chosen by the operator.

**Neutral**:
- The `operador` route folder grows four pages; the existing `/operador` placeholder stays until the dashboard (feature 9).
- `ActionResult` gains `details`, so the member side actions are unchanged (the field is absent there).
- Scope feature 15 says "the screens come later": this spec is those screens. It needs its own scope row (see Follow-up).

## Follow-up

- [ ] Add a scope row for these screens (suggested: a new feature, Slice 4, needs 15) and point it at this spec, so `/develop operator administration screens` has something to advance.
- [ ] Feature 13 (role based navigation) should extend the role aware sidebar leaf from build task 2, not add a second mechanism.
- [ ] README "Supuestos": the zone list is a short curated one, a logo is a pasted https URL (no upload), and deactivated sedes, rooms and clients are hidden until asked for.
- [ ] Next version ideas for the README: a detail view per client with its bookings and hours over time, a searchable zone picker, and bulk blocks (a recurring closure).
