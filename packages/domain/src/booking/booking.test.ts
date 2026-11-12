import { describe, expect, it } from "vitest";

import { bookingPhase, checkCancellation } from "./booking";

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

describe("checkCancellation (spec 0001, cancel any time before the start)", () => {
  it("allows a confirmed booking that has not started, even one second before", () => {
    expect(checkCancellation(confirmed, new Date("2026-11-10T12:59:59Z"))).toEqual({ ok: true, value: null });
  });

  it("refuses at the exact start and after it: cancel_not_allowed", () => {
    expect(checkCancellation(confirmed, startsAt)).toEqual({ ok: false, reason: "cancel_not_allowed" });
    expect(checkCancellation(confirmed, new Date("2026-11-10T15:00:00Z"))).toEqual({
      ok: false,
      reason: "cancel_not_allowed",
    });
  });

  it("refuses a booking already cancelled, before or after its start: already_cancelled", () => {
    const cancelled = { ...confirmed, status: "cancelled" as const };
    expect(checkCancellation(cancelled, new Date("2026-11-01T00:00:00Z"))).toEqual({
      ok: false,
      reason: "already_cancelled",
    });
    expect(checkCancellation(cancelled, new Date("2026-11-11T00:00:00Z"))).toEqual({
      ok: false,
      reason: "already_cancelled",
    });
  });
});
