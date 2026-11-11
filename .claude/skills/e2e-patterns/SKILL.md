---
name: e2e-patterns
description: Patterns for writing and editing Playwright end to end tests in apps/web/e2e. Use when you add or change a file under apps/web/e2e, when an e2e test fails or flakes, or when a change alters what the e2e suite asserts (texts, what is stored, timing).
---

# End to end patterns (apps/web/e2e)

The suite runs against `next start` (the production build) with axe on WCAG 2.2 AA tags. Helpers are in `e2e/fixtures.ts`. Which command to run for which change is in `scoped-verification`.

## Selecting by name

- **`getByRole(role, { name })` matches by substring, case insensitive.** Adding a control whose name contains an old one ("Cancelar reserva" next to "Cancelar") makes old selectors match two elements and fail in strict mode. Use `exact: true` whenever a name could be the start of another, and when you add a control, search `e2e/` for its name.
- **Texts live in `messages/es.json`.** When you change one, grep `e2e/` for the old text in the same change.

## Keyboard

- **Wait for focus to move before the next key.** Radix roving focus (toggle groups, radio groups, tabs, menus) can move focus a moment after an arrow key. Assert `toBeFocused()` on the target before pressing Space or Enter.
- **"Obscured" means something else is painted on top.** Check `document.elementFromPoint` at the element's center, not only its position against the sticky header.

## Reading a page that may redirect

- **Never read `response.text()` after `page.goto()` for a page that can redirect.** Read the HTML with `page.request.get(path, { maxRedirects: 0 })`, then use `page.goto` plus `expect(page).toHaveURL(...)` for what the user sees.

## Data between tests

- **Give each test its own data** (its own company, room or time slot), so parallel workers never collide on the overlap constraint.
- **Create data through the product or a fixture that uses the use cases**, not raw SQL, so the test sees what a user would.

## Timing, flakes and trust

- Wait for state, not time: `expect(...).toHaveURL`, `expect.poll`, `waitForHydration`. Never `waitForTimeout`.
- **Do not state a cause for a flake as fact until you measured it.** Run the test several times before and after the change and compare.
- **A sub second e2e PASS did not run the suite.** Read why before trusting it.
- Prove a new test can fail: break the code once and see it go red.
