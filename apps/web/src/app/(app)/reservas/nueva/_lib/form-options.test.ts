import { type FacilityRules, type LocalDate, zonedInstant } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import { initialBookingValues, startChoices, withChange } from "./form-options";

const CENTRAL: FacilityRules = {
  timeZone: "America/Argentina/Buenos_Aires",
  opensAt: 8 * 60,
  closesAt: 20 * 60,
  openWeekdays: [1, 2, 3, 4, 5],
};
// A facility that opens only Tuesday, 10:00 to 14:00.
const TUESDAYS: FacilityRules = { ...CENTRAL, opensAt: 10 * 60, closesAt: 14 * 60, openWeekdays: [2] };

// Monday 2026-11-09, 10:15 in Buenos Aires.
const NOW = zonedInstant("2026-11-09" as LocalDate, 10 * 60 + 15, CENTRAL.timeZone);
const ROOMS = [
  { id: "room-sol", facility: CENTRAL },
  { id: "room-mar", facility: CENTRAL },
  { id: "room-mini", facility: TUESDAYS },
];
const values = { roomId: "room-sol", date: "2026-11-10", start: "10:00", end: "11:00" };

describe("initialBookingValues (spec 0003, AC-7 and AC-8)", () => {
  it("opens on the next open day with room and times empty when nothing is prefilled", () => {
    expect(initialBookingValues(NOW, {}, ROOMS)).toEqual({ roomId: "", date: "2026-11-09", start: "", end: "" });
  });

  it("keeps a prefill the form would offer", () => {
    const params = { sala: "room-mar", fecha: "2026-11-12", inicio: "14:00", fin: "15:30" };
    expect(initialBookingValues(NOW, params, ROOMS)).toEqual({
      roomId: "room-mar",
      date: "2026-11-12",
      start: "14:00",
      end: "15:30",
    });
  });

  it.each([
    ["an unknown room", { sala: "room-nope" }, { roomId: "" }],
    ["a malformed date", { fecha: "12/11/2026" }, { date: "2026-11-09" }],
    ["a Saturday", { fecha: "2026-11-14" }, { date: "2026-11-09" }],
    ["a past day", { fecha: "2026-11-06" }, { date: "2026-11-09" }],
    ["a day beyond 60 days", { fecha: "2027-01-11" }, { date: "2026-11-09" }],
    ["a start off the list", { fecha: "2026-11-12", inicio: "10:15" }, { start: "" }],
    ["a start already passed today", { inicio: "09:00" }, { start: "" }],
    ["an end that does not fit the start", { fecha: "2026-11-12", inicio: "10:00", fin: "15:00" }, { end: "" }],
    ["an end without a start", { fecha: "2026-11-12", fin: "11:00" }, { end: "" }],
  ])("drops %s and falls back to its default", (_case, params, expected) => {
    expect(initialBookingValues(NOW, params, ROOMS)).toMatchObject(expected);
  });

  it("ignores repeated query parameters", () => {
    expect(initialBookingValues(NOW, { sala: ["room-sol", "room-mar"] }, ROOMS).roomId).toBe("");
  });
});

describe("startChoices", () => {
  it("disables the starts already passed on today only", () => {
    expect(startChoices("2026-11-09", NOW, CENTRAL).filter((option) => option.disabled)).toHaveLength(5);
    expect(startChoices("2026-11-10", NOW, CENTRAL).some((option) => option.disabled)).toBe(false);
  });

  it("offers every start while the typed date cannot be read", () => {
    expect(startChoices("", NOW, CENTRAL).some((option) => option.disabled)).toBe(false);
  });
});

describe("withChange (dependent fields)", () => {
  it("keeps an end that still fits a new start", () => {
    expect(withChange(values, "start", "10:30", NOW, ROOMS)).toMatchObject({ start: "10:30", end: "11:00" });
  });

  it("clears an end that no longer fits a later start", () => {
    expect(withChange(values, "start", "11:00", NOW, ROOMS)).toMatchObject({ start: "11:00", end: "" });
  });

  it("clears a start (and its end) already passed when the date switches to today", () => {
    expect(withChange(values, "date", "2026-11-09", NOW, ROOMS)).toMatchObject({ start: "", end: "" });
  });

  it("keeps the times when the new date still allows them", () => {
    expect(withChange(values, "date", "2026-11-11", NOW, ROOMS)).toEqual({ ...values, date: "2026-11-11" });
  });
});

describe("the lists follow the facility of the room (spec 0004, AC-9)", () => {
  it("opens on the next day that facility opens, when the room is prefilled", () => {
    expect(initialBookingValues(NOW, { sala: "room-mini" }, ROOMS)).toMatchObject({
      roomId: "room-mini",
      date: "2026-11-10",
    });
  });

  it("drops a prefilled day or time that facility does not offer", () => {
    const params = { sala: "room-mini", fecha: "2026-11-12", inicio: "09:00" };
    expect(initialBookingValues(NOW, params, ROOMS)).toMatchObject({ date: "2026-11-10", start: "" });
  });

  it("moves the date to the next open day and clears times that do not fit when the room changes", () => {
    const wednesday = { roomId: "room-sol", date: "2026-11-11", start: "09:00", end: "10:00" };
    expect(withChange(wednesday, "roomId", "room-mini", NOW, ROOMS)).toEqual({
      roomId: "room-mini",
      date: "2026-11-10",
      start: "",
      end: "",
    });
  });

  it("keeps the times when the new room's facility still offers them", () => {
    const tuesday = { roomId: "room-sol", date: "2026-11-10", start: "10:00", end: "11:00" };
    expect(withChange(tuesday, "roomId", "room-mini", NOW, ROOMS)).toEqual({ ...tuesday, roomId: "room-mini" });
  });
});
