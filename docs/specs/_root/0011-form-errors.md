# 0011 · Where a form says why it was refused

One pattern for every form's refusal, operator and company alike. Amends spec 0003 (AC-3, AC-9 and its single alert
slot) and spec 0005 (AC-10, its field marks table's "alert only" and the alert with "Ver las reservas afectadas"). The
reasons, their texts (`errors.*`) and which fields each one marks do not change.

## Design

- **A refusal that names a field goes under that field.** The first field the refusal names that shows its own refusals
  (`useFieldError`) holds the reason in one line under the control (`FieldErrorText`). The form scrolls it into view
  and the control takes the focus; the others it names are marked `aria-invalid`. Each marked control points at the
  line with `aria-describedby`. The line is not a live region: the focus on the control already reads it once.
- **Anything else opens an alert dialog on top** (`ErrorDialog`, on the adaptive alert dialog: a drawer on a phone). It
  covers no field named (a block over a block, a sala inactive), bookings in the way (their list by client is its
  body), a session that ended, a busy server, and the forms with no visible field (book, cancel, sign in). It takes
  the focus, is read out and has to be answered: "Entendido", plus "Reintentar" for `busy` (sends the same values
  again) and "Elegir usuario de nuevo" for `unauthenticated`. Closing it gives the focus back to the submit button.
  The form stays open underneath with what was typed.
- **A success** closes the form and shows a toast, as before.
- **No dialog is taller than the screen** (`90dvh`). The form dialog and the error dialog are columns: the header and
  the buttons stay put and only the body scrolls. Any other dialog scrolls as a whole (`src/styles/overlays.css`).

## Decisions

- **Not the alert slot at the top of the form** (specs 0003 and 0005): it took the form's space on every refusal and
  sat away from the field to fix.
- **Not a toast for the reasons no field holds:** Sonner draws outside the modal dialog, where its focus trap and the
  `aria-hidden` it puts on the rest of the page keep keyboard and screen reader users from reaching or hearing it, and a
  click on it counts as a click outside. An alert dialog has none of those problems.
- **No TanStack Form:** every rule is checked by the Server Action (the use cases decide overlaps and taken names), so a
  client form state would only duplicate `useActionState`. Worth weighing again if checks before submit are wanted.
- **A field opts in by registering.** `useFieldError` tells the form the field can show its reason; a refusal naming
  only fields that did not register (a hidden input) falls back to the dialog, so no reason is ever lost.

## Code area

`apps/web/src/components/error-dialog.tsx`, `field-error-text.tsx`, `adaptive-alert-dialog.tsx`,
`date-picker-field.tsx`, `apps/web/src/app/(app)/operador/_components/form-dialog.tsx`, `bookings-in-the-way.tsx`,
`field.tsx`, the operator fields, `apps/web/src/components/booking/confirm-booking.tsx`, the cancel button, the sign in
form, `apps/web/src/styles/overlays.css`, `apps/web/messages/es.json` (`formError`).

## Open

- No e2e covers a reason under a field on the block form, a refused cancel or a refused sign in yet. The booking
  refusals (a room taken meanwhile, an ended session) and the operator's (a taken sede name, bookings or a block in
  the way, a sede with active rooms) are covered in `bookings.spec.ts`, `operator.spec.ts` and `conflicts.spec.ts`.
