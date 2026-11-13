import type { ReactNode } from "react";

import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";

/**
 * One group of the search's left column (the sede, the meeting, the day and time): a card headed by its step number
 * or an icon, its title as the section's name, and an optional action at the right of the title ("Hoy").
 */
export function SearchGroup({
  id,
  mark,
  title,
  action,
  children,
}: {
  /** The heading's id; the section is named by it. */
  readonly id: string;
  /** The step number, or an icon. */
  readonly mark: ReactNode;
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <Card role="region" aria-labelledby={id}>
      <CardHeader>
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs [&_svg]:size-3.5"
          >
            {mark}
          </span>
          {title}
        </h2>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
