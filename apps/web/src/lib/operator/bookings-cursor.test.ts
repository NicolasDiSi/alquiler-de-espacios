import { describe, expect, it } from "vitest";

import { decodeOperatorCursor, encodeOperatorCursor } from "./bookings-cursor";

const position = {
  now: new Date("2030-06-15T12:00:00Z"),
  run: "past" as const,
  startsAt: new Date("2030-06-14T10:00:00Z"),
  id: "booking-1",
};

describe("operator bookings cursor", () => {
  it("round trips a position", () => {
    expect(decodeOperatorCursor(encodeOperatorCursor(position))).toEqual(position);
  });

  it.each([
    "",
    "not-base64-json",
    Buffer.from("{}").toString("base64url"),
    Buffer.from('{"run":"x"}').toString("base64url"),
  ])("refuses a malformed cursor (%s)", (cursor) => {
    expect(decodeOperatorCursor(cursor)).toBeNull();
  });
});
