import { describe, expect, it } from "vitest";

import { pageVistaOf, VISTAS, vistaOf } from "./views";

describe("vistaOf (spec 0003, the views of Mis reservas)", () => {
  it("maps each vista to its API view", () => {
    expect(VISTAS).toEqual({ proximas: "upcoming", pasadas: "past", canceladas: "cancelled" });
    expect(vistaOf("pasadas")).toBe("pasadas");
  });

  it("falls back to Próximas for a missing, unknown or repeated value", () => {
    expect(vistaOf(undefined)).toBe("proximas");
    expect(vistaOf("todas")).toBe("proximas");
    expect(vistaOf("toString")).toBe("proximas");
    expect(vistaOf(["pasadas"])).toBe("proximas");
  });

  it("opens the calendar only for calendario, and any other value as a list view", () => {
    expect(pageVistaOf("calendario")).toBe("calendario");
    expect(pageVistaOf("canceladas")).toBe("canceladas");
    expect(pageVistaOf(["calendario"])).toBe("proximas");
  });
});
