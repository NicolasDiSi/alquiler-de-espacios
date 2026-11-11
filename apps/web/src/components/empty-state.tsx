import type { ReactNode } from "react";

import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

/** An empty state made from the base tokens: an icon, a title, a short explanation and an optional action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-card flex flex-col items-center justify-center gap-3 rounded-lg border px-6 py-12 text-center shadow-sm",
        className,
      )}
    >
      <span className="bg-secondary text-primary flex size-12 items-center justify-center rounded-full">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="max-w-md space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {action}
    </section>
  );
}
