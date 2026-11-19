import { Skeleton } from "@/components/ui/skeleton";

/** The operator pages read on the server; this is what paints while they do (spec 0005, AC-14). */
export function OperatorLoading() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: 4 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of placeholders
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
