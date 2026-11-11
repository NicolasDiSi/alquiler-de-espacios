import { describe, expect, it } from "vitest";

import { createUuidV7Generator } from "./ids";

describe("createUuidV7Generator", () => {
  it("writes a version 7, RFC 9562 variant UUID", () => {
    const id = createUuidV7Generator().next();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("puts the milliseconds first, so ids sort by creation", () => {
    let time = Date.UTC(2030, 0, 7);
    const ids = createUuidV7Generator(() => time);
    const first = ids.next();
    time += 1;
    const second = ids.next();
    expect(first.replaceAll("-", "").slice(0, 12)).toBe((time - 1).toString(16).padStart(12, "0"));
    expect(first < second).toBe(true);
  });

  it("never repeats", () => {
    const ids = createUuidV7Generator(() => 0);
    const seen = new Set(Array.from({ length: 1000 }, () => ids.next()));
    expect(seen.size).toBe(1000);
  });
});
