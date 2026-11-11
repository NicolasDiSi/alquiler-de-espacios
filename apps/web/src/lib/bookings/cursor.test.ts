import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./cursor";

const position = { startsAt: new Date("2026-11-12T13:00:00.000Z"), id: "0193a1b2-booking" };

describe("page cursor (spec 0003)", () => {
  it("round trips a position for its view", () => {
    expect(decodeCursor(encodeCursor("upcoming", position), "upcoming")).toEqual(position);
  });

  it("carries the view, the start and the id, and never a company", () => {
    const payload = JSON.parse(Buffer.from(encodeCursor("past", position), "base64url").toString("utf8"));
    expect(Object.keys(payload).sort()).toEqual(["id", "startsAt", "view"]);
  });

  it("refuses a cursor from another view", () => {
    expect(decodeCursor(encodeCursor("upcoming", position), "past")).toBeNull();
  });

  it("refuses anything that is not a cursor", () => {
    expect(decodeCursor("not-base64-json", "upcoming")).toBeNull();
    const wrongShape = Buffer.from(JSON.stringify({ view: "upcoming", startsAt: "yesterday", id: "x" })).toString(
      "base64url",
    );
    expect(decodeCursor(wrongShape, "upcoming")).toBeNull();
  });
});
