import { describe, expect, it } from "vitest";

import { blockPhase } from "./block";

describe("blockPhase (spec 0005, derived at read time)", () => {
  const endsAt = new Date("2030-01-07T18:00:00Z");

  it("is active until its end, finished from its end on", () => {
    expect(blockPhase({ endsAt, releasedAt: null }, new Date("2030-01-07T17:59:59Z"))).toBe("active");
    expect(blockPhase({ endsAt, releasedAt: null }, endsAt)).toBe("finished");
  });

  it("is released once released, even before or after its end", () => {
    const releasedAt = new Date("2030-01-01T00:00:00Z");
    expect(blockPhase({ endsAt, releasedAt }, new Date("2029-12-31T00:00:00Z"))).toBe("released");
    expect(blockPhase({ endsAt, releasedAt }, new Date("2031-01-01T00:00:00Z"))).toBe("released");
  });
});
