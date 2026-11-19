import { type Actor, fail, ok, type UserId } from "@espacios/domain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { runOperatorFlow } from "./operator-action";

const operator = { role: "operator", userId: "user-operador" as UserId } as Actor;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function deps(actor: Actor | null = operator) {
  return {
    actor: vi.fn(async () => actor),
    successText: (key: string) => `success.${key}`,
    errorText: (reason: string) => `errors.${reason}`,
    revalidate: vi.fn(),
  };
}

const schema = z.object({ name: z.string().trim().min(1), capacity: z.string().regex(/^\d+$/).transform(Number) });

describe("runOperatorFlow (spec 0005)", () => {
  it("runs the use case with the parsed input and the session's actor, then reads the pages again", async () => {
    const run = vi.fn(async () => ok({ id: "r-1" }));
    const d = deps();
    const state = await runOperatorFlow(
      form({ name: " Sol ", capacity: "6" }),
      { schema, run, success: "roomCreated", revalidate: ["/operador/sedes"] },
      d,
    );
    expect(run).toHaveBeenCalledWith(operator, { name: "Sol", capacity: 6 });
    expect(d.revalidate).toHaveBeenCalledWith("/operador/sedes");
    expect(state?.result).toEqual({ ok: true, value: { id: "r-1" }, message: "success.roomCreated" });
  });

  it("answers unauthenticated without a session, and never runs the use case", async () => {
    const run = vi.fn(async () => ok(null));
    const state = await runOperatorFlow(
      form({ name: "Sol" }),
      { schema, run, success: "x", revalidate: [] },
      deps(null),
    );
    expect(run).not.toHaveBeenCalled();
    expect(state?.result).toMatchObject({ ok: false, reason: "unauthenticated", message: "errors.unauthenticated" });
    expect(state?.values).toEqual({ name: "Sol" });
  });

  it("marks the fields that do not parse and keeps what was typed", async () => {
    const run = vi.fn(async () => ok(null));
    const state = await runOperatorFlow(
      form({ name: "", capacity: "seis" }),
      { schema, run, success: "x", revalidate: [] },
      deps(),
    );
    expect(run).not.toHaveBeenCalled();
    expect(state?.result).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(state?.invalidFields).toEqual(["name", "capacity"]);
    expect(state?.values).toEqual({ name: "", capacity: "seis" });
  });

  it("marks the fields a refusal names, carries the bookings in the way, and reads nothing again", async () => {
    const details = { total: 1, bookings: [] };
    const d = deps();
    const state = await runOperatorFlow(
      form({ name: "Sol", capacity: "6" }),
      {
        schema,
        run: async () => fail("has_future_bookings", details),
        success: "x",
        marks: (reason) => (reason === "has_future_bookings" ? ["capacity"] : []),
        revalidate: ["/operador/sedes"],
      },
      d,
    );
    expect(state?.result).toEqual({
      ok: false,
      reason: "has_future_bookings",
      message: "errors.has_future_bookings",
      details,
    });
    expect(state?.invalidFields).toEqual(["capacity"]);
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it("passes a member's forbidden from the use case through as it is", async () => {
    const member = { role: "member", userId: "u" as UserId } as Actor;
    const state = await runOperatorFlow(
      form({ name: "Sol", capacity: "6" }),
      { schema, run: async () => fail("forbidden"), success: "x", revalidate: [] },
      deps(member),
    );
    expect(state?.result).toMatchObject({ ok: false, reason: "forbidden" });
  });
});
