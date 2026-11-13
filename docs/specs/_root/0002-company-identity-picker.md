# 0002 · Company identity: the picker screen and the edges

**Status**: Accepted (ratified 2026-11-13)
**Date**: 2026-11-11
**Authorized by**: Nicolas Di si, during /develop

## Owed decision

Spec 0001 decides the identity mechanism (seeded users, an HMAC signed cookie, the server resolves the company from it), but not the screen that sets the cookie, where an unsigned visitor goes, where each role lands, or what a member sees on an operator page. No `design.md` or page spec covers it.

## Assumption built on

- **Picker route:** `/ingresar`, outside the sidebar shell. One card per company listing its users, each a "Entrar como …" button (a form posting the `signInAs(userId)` Server Action). The operator has its own card.
- **No valid cookie:** any page of the shell redirects to `/ingresar`. A Route Handler answers 401 with `{ code: "unauthenticated", message }`.
- **Landing:** a member lands on `/`, the operator on `/operador` (a placeholder until the operator dashboard ships).
- **Wrong role:** a member on an operator page, or the operator on a member page, gets the 403 page (`forbidden()`, Next.js `authInterrupts`). A Route Handler answers 403 with `{ code: "forbidden", message }`.
- **Header:** shows the current user and company, with "Cambiar de usuario", which clears the cookie and returns to `/ingresar`.
- **Signing in again** while signed in is allowed: the picker stays reachable and replaces the cookie.

## Code area

`apps/web/src/app/ingresar/`, `apps/web/src/app/(app)/`, `apps/web/src/app/(app)/operador/`, `apps/web/src/lib/session/`, `apps/web/src/composition/`, `packages/application/src/ports/`, `packages/domain/src/identity/`, `packages/db/src/`

## Requirements

- AC-1: picking a seeded user sets a signed cookie and lands on the role's home.
- AC-2: a tampered, expired or unknown user cookie is treated as signed out (redirect for pages, 401 for Route Handlers).
- AC-3: a member cannot reach operator routes (403), and the operator cannot reach member routes (403).
- AC-4: the company id used by every action comes from the cookie's user, never from the request.

## Ratify

Decided during /develop and ratified as built on 2026-11-13.
