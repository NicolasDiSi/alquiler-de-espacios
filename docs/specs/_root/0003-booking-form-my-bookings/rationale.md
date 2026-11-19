# 0003. Booking form and my bookings screens: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md`; this file explains why.

## Context

The brief asks that client companies book a room for a date and a time, see and cancel their own bookings, and always know the result of each operation, including why a booking failed. Spec 0001 already decides the rules (one zone, a 30 minute grid, Monday to Friday 08:00 to 20:00, 30 minutes to 4 hours, up to 60 days ahead), the API, the typed result and the overlap guard in the database. Feature 4 built the error contract: one reason, one status, one Spanish message. What no spec decides is the two screens a member uses: where the form lives, how a date and a time are chosen, how a refusal is shown, and what the list of bookings shows and in which order.

The project builds by Tracer Bullet: this feature is the first thread through every layer (a company books a room and sees it in its list), so it also carries the booking use case and the list query that 0001 describes but nothing implements yet. Feature 6 (the availability grid) and feature 7 (cancel) come later and must be able to attach to these screens without redesigning them. The app is Spanish (`es-AR`), built on the existing shell, theme and shadcn components, with no `design.md`, and must pass axe at WCAG 2.2 AA.

The forces: a thin first slice (72 hour challenge), clear failure reasons as a graded requirement, tenant isolation that must hold in every read, accessibility for a date and time picker (a known hard pattern), and room for the next two features.

## Options considered

### Option 1: Two server rendered pages, one URL per list view

The form is its own page (`/reservas/nueva`) that posts a Server Action and can be prefilled from its URL. `Mis reservas` renders each view (Próximas, Pasadas, Canceladas) on the server at its own URL, and "Ver más" fetches further pages from the REST API.

**Pros**:
- Each state has a URL: the grid of feature 6 can link a free slot straight into the form, and a view can be reloaded or shared.
- Server rendering keeps tenant data on the server and works before the client hydrates.
- Plenty of room for a calendar, two time lists and an error with field marks.

**Cons**:
- One more page and navigation step than a dialog.
- Switching views is a navigation (a short loading state) rather than an instant client toggle.

### Option 2: Dialog form over a client side list

`Mis reservas` holds the list with client tabs; "Nueva reserva" opens a dialog with the form; the list refreshes after a booking.

**Pros**:
- Feels fast: no page change, the list stays in view.
- One page to build.

**Cons**:
- No URL for the form, so feature 6 cannot prefill it with a link; it would need shared client state.
- A calendar popover and field errors inside a modal are cramped and harder to make accessible (focus inside two layers).
- Client tabs fetch data after load, so each view needs its own loading and error handling in the client.

### Option 3: Book only from the availability grid

Skip a standalone form: build feature 6's grid first and book by clicking a free slot.

**Pros**:
- The user sees what is free before choosing, so conflicts are rare.
- One booking path instead of two.

**Cons**:
- Delays the thin thread: the grid needs the availability function, the endpoint and a much harder accessible component before anything can be booked.
- A booking made through the API or a typed time still needs the same error handling, so the form logic is not avoided.

## Rationale

Option 1 fits the Tracer Bullet approach best: it is the shortest real path through every layer (form, Server Action, use case, database, list) and needs no availability work, while leaving clean seams for the next features. The URL per state is the deciding force. Feature 6 links a free slot to `/reservas/nueva?sala=&fecha=&inicio=&fin=`, and feature 7 moves a booking from Próximas to Canceladas, without either one changing these screens. Option 2's speed is real, but it trades away those seams and puts the hardest accessible widget (a date picker) inside a modal. Option 3 would make conflicts rare, but it puts the slowest, hardest piece first, which is the opposite of a thin first thread.

Within the chosen option, the engineer's picks follow the same logic. Start and end lists on the 30 minute grid, and a calendar that disables closed and out of range days, prevent most rule mistakes rather than reporting them, and the server still applies every rule. A refusal shows in an alert that takes focus plus a mark on the field it concerns, because the brief grades "understand why a booking could not be made" and a toast alone is easy to miss and poorly announced. The list splits into three views because cancel (feature 7) needs a clear place to move bookings to, and past bookings read best most recent first, which 0001's single "upcoming first" order could not express; hence the `view` parameter, the one extension to 0001's API.

Decided here without a question (local calls made with the full design in view):
- **Views as links styled as tabs, not ARIA tabs.** Each view is a separate server rendered URL, so they are navigation (`aria-current="page"`). Runner up: Radix Tabs synced to the URL, which promises in page switching that does not happen.
- **"Ver más" through `GET /api/v1/bookings`, not a Server Action.** A read belongs on a cacheable GET, and it reuses the documented API. Runner up: a Server Action, which runs as a POST and one at a time.
- **Canceladas ordered by start, most recent first, not by cancel time.** One index `(tenant_id, starts_at, id)` serves all three views. Runner up: order by `cancelled_at`, which needs a second index.
- **Room existence checked through `RoomCatalog.findRoom` before the insert.** It gives `not_found` without reading a foreign key error. Runner up: map the foreign key violation `23503`.
- **`phase` computed in the use case with the clock port.** One source for "En curso" and "Finalizada" on the server and in the API. Runner up: compute it in the browser, which would use the visitor's clock.
- **Starts already passed today are disabled, not hidden.** The list keeps its shape and says why. Runner up: hide them.
- **The `nueva` parameter is cleared after the toast.** A reload must not announce the booking again.
