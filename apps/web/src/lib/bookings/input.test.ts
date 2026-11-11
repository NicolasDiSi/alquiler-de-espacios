import { describe, expect, it } from "vitest";

import { fieldsMarkedBy } from "./field-marks";
import { listQuerySchema, parseBookingForm, parseBookingRequest } from "./input";

const form = { roomId: "room-norte", date: "2026-11-12", start: "10:00", end: "11:30" };

describe("parseBookingForm", () => {
  it("builds the instants in Buenos Aires time", () => {
    expect(parseBookingForm(form)).toEqual({
      ok: true,
      value: {
        roomId: "room-norte",
        startsAt: new Date("2026-11-12T13:00:00Z"),
        endsAt: new Date("2026-11-12T14:30:00Z"),
      },
    });
  });

  it("lets a time off the marks through, so the use case answers not_on_grid", () => {
    expect(parseBookingForm({ ...form, start: "10:15" }).ok).toBe(true);
  });

  it("names the fields that cannot be read, in form order", () => {
    expect(parseBookingForm({ roomId: "", date: "12/11/2026", start: "10:00", end: "25:00" })).toEqual({
      ok: false,
      invalidFields: ["roomId", "date", "end"],
    });
  });

  it("refuses a day that does not exist", () => {
    expect(parseBookingForm({ ...form, date: "2026-02-30" })).toEqual({ ok: false, invalidFields: ["date"] });
  });

  it("refuses an empty date (typed text that could not be read)", () => {
    expect(parseBookingForm({ ...form, date: "" })).toEqual({ ok: false, invalidFields: ["date"] });
  });
});

describe("parseBookingRequest", () => {
  it("accepts RFC 3339 with an offset or Z", () => {
    expect(
      parseBookingRequest({
        roomId: "room-norte",
        startsAt: "2026-11-12T10:00:00-03:00",
        endsAt: "2026-11-12T14:00:00Z",
      }),
    ).toEqual({
      roomId: "room-norte",
      startsAt: new Date("2026-11-12T13:00:00Z"),
      endsAt: new Date("2026-11-12T14:00:00Z"),
    });
  });

  it("refuses a time without an offset, a missing field or a body that is not an object", () => {
    expect(
      parseBookingRequest({ roomId: "r", startsAt: "2026-11-12T10:00:00", endsAt: "2026-11-12T11:00:00Z" }),
    ).toBeNull();
    expect(parseBookingRequest({ startsAt: "2026-11-12T10:00:00Z", endsAt: "2026-11-12T11:00:00Z" })).toBeNull();
    expect(parseBookingRequest("nope")).toBeNull();
  });
});

describe("listQuerySchema", () => {
  it("defaults to the upcoming view, 50 per page", () => {
    expect(listQuerySchema.parse({})).toEqual({ view: "upcoming", limit: 50 });
  });

  it("refuses an unknown view and a limit above 100", () => {
    expect(listQuerySchema.safeParse({ view: "all" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(listQuerySchema.parse({ view: "past", limit: "100" })).toEqual({ view: "past", limit: 100 });
  });
});

describe("fieldsMarkedBy (spec 0003, field marks per reason)", () => {
  it.each([
    ["not_found", ["roomId"]],
    ["past_date", ["date"]],
    ["beyond_horizon", ["date"]],
    ["outside_hours", ["start", "end"]],
    ["not_on_grid", ["start", "end"]],
    ["invalid_range", ["end"]],
    ["too_short", ["end"]],
    ["too_long", ["end"]],
    ["conflict", ["start", "end"]],
    ["busy", []],
    ["unauthenticated", []],
    ["forbidden", []],
  ] as const)("%s marks %j", (reason, fields) => {
    expect(fieldsMarkedBy(reason)).toEqual(fields);
  });
});
