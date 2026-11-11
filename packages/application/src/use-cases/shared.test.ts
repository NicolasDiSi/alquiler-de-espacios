import { ok } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import { ConcurrencyError } from "../ports/ports";
import { withConflictHandling } from "./shared";

describe("withConflictHandling", () => {
  it("returns the work's result", async () => {
    await expect(withConflictHandling(async () => ok("done"))).resolves.toEqual({ ok: true, value: "done" });
  });

  it("turns a lost race into a conflict", async () => {
    const result = await withConflictHandling(async () => {
      throw new ConcurrencyError("Booking", "b-1");
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "conflict", message: "Booking b-1 was changed by someone else." },
    });
  });

  it("rethrows other errors", async () => {
    await expect(
      withConflictHandling(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
