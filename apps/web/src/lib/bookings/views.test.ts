import { describe, expect, it } from "vitest";

import { VISTAS, vistaOf } from "./views";

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
});
