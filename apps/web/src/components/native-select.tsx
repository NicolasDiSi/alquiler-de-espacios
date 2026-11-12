import type { ComponentProps } from "react";

import { cn } from "cn";

/**
 * A native select with the look of the shadcn `Input`: it posts with the form, disables single options, and keeps the
 * platform's own keyboard, screen reader and phone pickers (same choice as the booking form, spec 0003).
 */
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2 text-base outline-none focus-visible:ring-3 aria-invalid:ring-3 md:text-sm";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(SELECT_CLASS, className)} {...props} />;
}
