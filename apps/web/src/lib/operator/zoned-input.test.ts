import { describe, expect, it } from "vitest";

import { startOfZonedDay, zonedPeriod } from "./zoned-input";

describe("operator days and times in the sede's zone (spec 0005)", () => {
  it("reads a block in Buenos Aires, closing at midnight included", () => {
    const period = zonedPeriod(
      { startDate: "2030-01-07", startTime: "08:00", endDate: "2030-01-07", endTime: "24:00" },
      "America/Argentina/Buenos_Aires",
    );
    expect(period?.startsAt.toISOString()).toBe("2030-01-07T11:00:00.000Z");
    expect(period?.endsAt.toISOString()).toBe("2030-01-08T03:00:00.000Z");
  });

  it("follows the zone's own offset, daylight saving included (Santiago is -03 in January, -04 in July)", () => {
    const summer = zonedPeriod(
      { startDate: "2030-01-07", startTime: "09:00", endDate: "2030-01-07", endTime: "10:00" },
      "America/Santiago",
    );
    const winter = zonedPeriod(
      { startDate: "2030-07-08", startTime: "09:00", endDate: "2030-07-08", endTime: "10:00" },
      "America/Santiago",
    );
    expect(summer?.startsAt.toISOString()).toBe("2030-01-07T12:00:00.000Z");
    expect(winter?.startsAt.toISOString()).toBe("2030-07-08T13:00:00.000Z");
  });

  it("refuses a day or a time it cannot read", () => {
    expect(
      zonedPeriod({ startDate: "2030-02-30", startTime: "09:00", endDate: "2030-02-30", endTime: "10:00" }, "UTC"),
    ).toBeNull();
    expect(
      zonedPeriod({ startDate: "2030-01-07", startTime: "9", endDate: "2030-01-07", endTime: "10:00" }, "UTC"),
    ).toBeNull();
  });

  it("starts a day at its midnight in the zone", () => {
    expect(startOfZonedDay("2026-01-01", "America/Argentina/Buenos_Aires")?.toISOString()).toBe(
      "2026-01-01T03:00:00.000Z",
    );
    expect(startOfZonedDay("nope", "UTC")).toBeNull();
  });
});
