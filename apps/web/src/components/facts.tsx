import type { ReactNode } from "react";

/** The facts of a record under its name, as terms and values: quiet, scannable, one per column on wide screens. */
export function Facts({ items }: { readonly items: readonly { readonly term: string; readonly value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:flex sm:flex-wrap">
      {items.map((item) => (
        <div key={item.term} className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-xs">{item.term}</dt>
          <dd className="tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
