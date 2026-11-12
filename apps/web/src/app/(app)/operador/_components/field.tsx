import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

/** A label above its control, with an optional hint. The control carries its own `id` (the same as `htmlFor`). */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
