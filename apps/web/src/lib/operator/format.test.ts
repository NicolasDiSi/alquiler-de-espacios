import { describe, expect, it } from "vitest";

import { DAY_MARKS, initialsOf, minutesOf, slugify, zoneOptions } from "./format";

describe("operator display helpers (spec 0005)", () => {
  it("offers every half hour from 00:00 to 24:00", () => {
    expect(DAY_MARKS).toHaveLength(49);
    expect(DAY_MARKS[0]).toBe("00:00");
    expect(DAY_MARKS[18]).toBe("09:00");
    expect(DAY_MARKS.at(-1)).toBe("24:00");
  });

  it("turns a time into minutes and a non time into NaN", () => {
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("24:00")).toBe(1440);
    expect(minutesOf("nine")).toBeNaN();
  });

  it("adds the sede's own zone when it is not in the list", () => {
    expect(zoneOptions("Asia/Tokyo").at(-1)).toBe("Asia/Tokyo");
    expect(zoneOptions("UTC")).toEqual(zoneOptions());
  });

  it("suggests a code from a name", () => {
    expect(slugify("Ágora  Consultores S.A.")).toBe("agora-consultores-s-a");
    expect(slugify("  --  ")).toBe("");
    expect(slugify("x".repeat(70)).length).toBe(63);
  });

  it("takes the initials of the first two words", () => {
    expect(initialsOf("ana maría pérez")).toBe("AM");
    expect(initialsOf("")).toBe("");
  });
});
