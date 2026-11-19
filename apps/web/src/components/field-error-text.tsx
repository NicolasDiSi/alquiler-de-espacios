/**
 * A refusal's reason under the field it names, linked from the control's `aria-describedby`. No live region (unlike
 * shadcn's `FieldError`, which is an alert): the control takes the focus when it appears and the screen reader reads
 * this as its description, so it is heard once.
 */
export function FieldErrorText({
  error,
}: {
  readonly error?: { readonly id: string; readonly message: string } | null;
}) {
  return error ? (
    <p id={error.id} className="text-destructive text-sm">
      {error.message}
    </p>
  ) : null;
}
