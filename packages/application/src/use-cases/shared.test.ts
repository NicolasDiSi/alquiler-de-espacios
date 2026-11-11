import { ok } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import { BusyError, ConcurrencyError } from "../ports/ports";
import { withRaceHandling } from "./shared";

describe("withRaceHandling", () => {
  it("returns the work's result", async () => {
    await expect(withRaceHandling(async () => ok("done"))).resolves.toEqual({ ok: true, value: "done" });
  });

  it("turns a lost race into conflict, without the driver's details", async () => {
    const driverError = new Error('conflicting key value violates exclusion constraint "booking_no_overlap"');
    const result = await withRaceHandling(async () => {
      throw new ConcurrencyError({ cause: driverError });
    });
    expect(result).toEqual({ ok: false, reason: "conflict" });
  });

  it("turns a timeout into busy", async () => {
    const result = await withRaceHandling(async () => {
      throw new BusyError();
    });
    expect(result).toEqual({ ok: false, reason: "busy" });
  });

  it("rethrows other errors", async () => {
    await expect(
      withRaceHandling(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
