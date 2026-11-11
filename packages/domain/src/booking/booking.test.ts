import { describe, expect, it } from "vitest";

import { bookingPhase } from "./booking";

const startsAt = new Date("2026-11-10T13:00:00Z");
const endsAt = new Date("2026-11-10T14:00:00Z");
const confirmed = { status: "confirmed" as const, startsAt, endsAt };

describe("bookingPhase (spec 0003, derived at read time)", () => {
  it("is upcoming before the start", () => {
    expect(bookingPhase(confirmed, new Date("2026-11-10T12:59:59Z"))).toBe("upcoming");
  });

  it("is in progress from the start until the end", () => {
    expect(bookingPhase(confirmed, startsAt)).toBe("in_progress");
    expect(bookingPhase(confirmed, new Date("2026-11-10T13:59:59Z"))).toBe("in_progress");
  });

  it("is finished from the end on", () => {
    expect(bookingPhase(confirmed, endsAt)).toBe("finished");
  });

  it("is cancelled whatever the time", () => {
    expect(bookingPhase({ ...confirmed, status: "cancelled" }, new Date("2026-11-01T00:00:00Z"))).toBe("cancelled");
  });
});
