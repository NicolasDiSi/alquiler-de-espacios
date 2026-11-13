import type { ReactNode } from "react";

import { FieldErrorText } from "@/components/field-error-text";
import { Label } from "@/components/ui/label";

/**
 * A label above its control, with an optional hint, and the refusal's reason under it when it names this field. The
 * control carries its own `id` (the same as `htmlFor`).
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  /** From `useFieldError`. */
  readonly error?: { readonly id: string; readonly message: string } | null;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      <FieldErrorText error={error} />
    </div>
  );
}
