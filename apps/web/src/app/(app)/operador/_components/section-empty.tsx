import type { ReactNode } from "react";

/** A section with nothing in it yet: what would be here, and the action that adds it. Lighter than a page's empty state. */
export function SectionEmpty({ children, action }: { readonly children: ReactNode; readonly action?: ReactNode }) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-muted-foreground/30 px-4 py-5 text-sm">
      <p className="max-w-prose">{children}</p>
      {action}
    </div>
  );
}
