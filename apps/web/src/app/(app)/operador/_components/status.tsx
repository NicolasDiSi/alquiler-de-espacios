import type { ReactNode } from "react";

import type { RecordStatus } from "@espacios/application";
import { cn } from "cn";
import { useFormatter, useTranslations } from "next-intl";

/**
 * A state as a dot and its words (spec 0005, `status-colors-and-errors`): the text carries the state, the dot only
 * reinforces it. Three tones, one meaning each: `success` is in service, `info` is a block in force, `neutral` is
 * history (retired, finished, released).
 */
export function StatusDot({
  tone,
  children,
}: {
  readonly tone: "success" | "info" | "neutral";
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm whitespace-nowrap",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          tone === "success" && "bg-success",
          tone === "info" && "bg-info",
          tone === "neutral" && "border-muted-foreground border",
        )}
      />
      {children}
    </span>
  );
}

/** Active, or retired with its date. `gender` agrees the word with the noun: "Sede activa", "Cliente activo". */
export function RecordStatusDot({
  status,
  since,
  gender,
}: {
  readonly status: RecordStatus;
  readonly since: string | null;
  readonly gender: "f" | "m";
}) {
  const t = useTranslations("operator.status");
  const format = useFormatter();
  if (status === "active" || !since) return <StatusDot tone="success">{t("active", { gender })}</StatusDot>;
  return (
    <StatusDot tone="neutral">
      {t("inactiveSince", { gender, date: format.dateTime(new Date(since), "short") })}
    </StatusDot>
  );
}
