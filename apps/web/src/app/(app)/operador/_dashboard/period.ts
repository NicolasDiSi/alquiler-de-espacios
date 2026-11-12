import type { DashboardPeriod } from "@espacios/domain";

/** The `periodo` URL parameter of the dashboard (spec 0006) and the days each one reads. */
export const PERIODOS = { "7d": 7, "30d": 30, "90d": 90 } as const satisfies Record<string, DashboardPeriod>;
export type Periodo = keyof typeof PERIODOS;

const DEFAULT_PERIODO: Periodo = "30d";

/** An unknown or missing `periodo` reads the last 30 days. */
export function periodoOf(value: unknown): Periodo {
  return typeof value === "string" && Object.hasOwn(PERIODOS, value) ? (value as Periodo) : DEFAULT_PERIODO;
}

/** The default period stays out of the URL, so `/operador` and the sidebar link mean the same page. */
export const periodoHref = (periodo: Periodo) =>
  periodo === DEFAULT_PERIODO ? "/operador" : `/operador?periodo=${periodo}`;
