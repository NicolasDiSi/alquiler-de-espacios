import type { MyBookingsView } from "@espacios/application";

/** The `vista` URL parameter of Mis reservas (spec 0003) and the API view each one shows. */
export const VISTAS = { proximas: "upcoming", pasadas: "past", canceladas: "cancelled" } as const satisfies Record<
  string,
  MyBookingsView
>;
export type Vista = keyof typeof VISTAS;

/** An unknown or missing `vista` shows Próximas. */
export function vistaOf(value: unknown): Vista {
  return typeof value === "string" && Object.hasOwn(VISTAS, value) ? (value as Vista) : "proximas";
}
