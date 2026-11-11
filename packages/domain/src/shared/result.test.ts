import { describe, expect, it } from "vitest";

import { fail, ok } from "./result";

describe("result", () => {
  it("wraps a value as a success", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("wraps a code and a message as a failure", () => {
    expect(fail("conflict", "Room taken")).toEqual({ ok: false, error: { code: "conflict", message: "Room taken" } });
  });
});
