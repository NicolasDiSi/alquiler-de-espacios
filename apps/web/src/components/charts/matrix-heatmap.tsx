import { cn } from "cn";

/** Strength of the chart color per step, capped so the cell text keeps its contrast in both themes. */
const STEP_MIX = [8, 20, 32, 46, 60] as const;
export const HEATMAP_STEPS = STEP_MIX.length;

/** The step of a 0 to 1 value, one step per fifth. */
const stepOf = (value: number) => Math.min(HEATMAP_STEPS - 1, Math.max(0, Math.floor(value * HEATMAP_STEPS)));

const fill = (step: number) => ({
  backgroundColor: `color-mix(in oklch, var(--chart-1) ${STEP_MIX[step]}%, var(--card))`,
});

export type MatrixHeatmapRow = {
  readonly label: string;
  /** 0 to 1 per column, `null` where there is nothing to measure. */
  readonly values: readonly (number | null)[];
};

/**
 * A quantity over two axes as a native table: row and column headers, the value written in every cell, and one hue that
 * darkens in fifths. The color only reinforces the number, so the table reads the same without it.
 */
export function MatrixHeatmap({
  caption,
  columns,
  rows,
  formatCell,
  emptyCell,
  legendLabel,
  legendSteps,
  className,
}: {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly MatrixHeatmapRow[];
  readonly formatCell: (value: number) => string;
  /** What a `null` cell shows (a dash). */
  readonly emptyCell: string;
  readonly legendLabel: string;
  /** One label per step, lowest first. */
  readonly legendSteps: readonly string[];
  readonly className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <table className="w-full table-fixed border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <td className="w-10" />
            {columns.map((column) => (
              <th key={column} scope="col" className="text-muted-foreground pb-1 text-center font-normal tabular-nums">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="text-muted-foreground pr-2 text-left font-normal">
                {row.label}
              </th>
              {row.values.map((value, index) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional and fixed per row
                  key={index}
                  className={cn(
                    "h-9 rounded-sm text-center tabular-nums",
                    value === null && "bg-muted text-muted-foreground",
                  )}
                  style={value === null ? undefined : fill(stepOf(value))}
                >
                  {value === null ? emptyCell : formatCell(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>{legendLabel}</span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {legendSteps.map((label, step) => (
            <li key={label} className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-sm border" style={fill(step)} />
              <span className="tabular-nums">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
