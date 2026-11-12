import { describe, expect, it } from "vitest";

import { blockForm, clientCreateForm, clientEditForm, facilityForm, idForm, roomCreateForm } from "./form-input";

describe("operator form inputs (spec 0005)", () => {
  it("reads a sede form into minutes, weekdays and a null address", () => {
    expect(
      facilityForm.parse({
        name: " Norte ",
        address: "",
        timeZone: "UTC",
        opensAt: "09:00",
        closesAt: "24:00",
        openWeekdays: "1,2,3",
      }),
    ).toEqual({ name: "Norte", address: null, timeZone: "UTC", opensAt: 540, closesAt: 1440, openWeekdays: [1, 2, 3] });
  });

  it("refuses a time that is not a time and an empty name", () => {
    const result = facilityForm.safeParse({
      name: "",
      timeZone: "UTC",
      opensAt: "9am",
      closesAt: "18:00",
      openWeekdays: "",
    });
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((issue) => issue.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["name", "address", "opensAt"]));
  });

  it("reads a room, leaving the date out when empty", () => {
    expect(roomCreateForm.parse({ facilityId: "f", name: "Sala", capacity: "8", activeFrom: "" })).toEqual({
      facilityId: "f",
      name: "Sala",
      capacity: 8,
      activeFrom: undefined,
    });
    expect(roomCreateForm.safeParse({ facilityId: "f", name: "Sala", capacity: "-1", activeFrom: "" }).success).toBe(
      false,
    );
  });

  it("reads a block with no room as the whole sede", () => {
    const parsed = blockForm.parse({
      facilityId: "f",
      roomId: "",
      startDate: "2030-01-07",
      startTime: "09:00",
      endDate: "2030-01-07",
      endTime: "24:00",
      reason: "Feriado",
    });
    expect(parsed.roomId).toBeNull();
  });

  it("accepts an https logo only, and an empty one clears it", () => {
    const base = { kind: "company", name: "Acme", slug: "acme", memberName: "" };
    expect(clientCreateForm.parse({ ...base, logoUrl: "" }).logoUrl).toBeNull();
    expect(clientCreateForm.parse({ ...base, logoUrl: "https://example.com/a.png" }).logoUrl).toBe(
      "https://example.com/a.png",
    );
    expect(clientCreateForm.safeParse({ ...base, logoUrl: "http://example.com/a.png" }).success).toBe(false);
    expect(clientEditForm.parse({ id: "c", name: "Acme", logoUrl: "" }).logoUrl).toBeNull();
  });

  it("refuses a code with capitals or spaces", () => {
    const form = { kind: "company", name: "Acme", logoUrl: "", memberName: "Ana" };
    expect(clientCreateForm.safeParse({ ...form, slug: "Acme Co" }).success).toBe(false);
    expect(clientCreateForm.parse({ ...form, slug: "acme-co" }).memberName).toBe("Ana");
  });

  it("needs an id", () => {
    expect(idForm.safeParse({ id: " " }).success).toBe(false);
  });
});
