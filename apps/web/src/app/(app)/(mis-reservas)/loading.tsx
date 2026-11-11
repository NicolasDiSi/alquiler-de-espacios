import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/** Six placeholder rows, each with a stable key. */
const ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"] as const;

/** While a view of Mis reservas renders: rows of the same height as the table, so nothing jumps when it arrives. */
export default async function MyBookingsLoading() {
  const t = await getTranslations("home");

  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p className="sr-only" role="status">
        {t("loading")}
      </p>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-72" />
      </div>
      <Skeleton className="h-10 w-80" />
      <div className="bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-sm">
        {ROWS.map((row) => (
          <Skeleton key={row} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
