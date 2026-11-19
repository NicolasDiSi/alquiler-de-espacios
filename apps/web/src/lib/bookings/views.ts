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

/** The fourth tab of Mis reservas: every confirmed booking on a calendar, read through the same API views. */
export const CALENDARIO = "calendario";
export type PageVista = Vista | typeof CALENDARIO;

/** `calendario` opens the calendar; anything else is a list view, as `vistaOf` reads it. */
export function pageVistaOf(value: unknown): PageVista {
  return value === CALENDARIO ? CALENDARIO : vistaOf(value);
}
