import { describe, expect, it } from "vitest";

import type { BlockRecord, FacilityRecord, RoomRecord } from "../ports/operator-catalog";
import {
  toOperatorBlockViews,
  toOperatorClientView,
  toOperatorFacilityViews,
  toOperatorRoomView,
} from "./operator-views";

const created = new Date("2026-01-01T12:00:00Z");
const facility = (over: Partial<FacilityRecord> = {}): FacilityRecord => ({
  id: "f-1",
  name: "Norte",
  address: null,
  timeZone: "America/Argentina/Buenos_Aires",
  opensAt: 480,
  closesAt: 1440,
  openWeekdays: [0, 5, 1],
  createdAt: created,
  deactivatedAt: null,
  ...over,
});
const room = (over: Partial<RoomRecord> = {}): RoomRecord => ({
  id: "r-1",
  facilityId: "f-1",
  name: "Sol",
  capacity: 6,
  activeFrom: created,
  deactivatedAt: null,
  createdAt: created,
  ...over,
});

describe("operator views (spec 0005)", () => {
  it("counts only the active rooms of each sede, from one read of every room", () => {
    const views = toOperatorFacilityViews(
      [facility(), facility({ id: "f-2", name: "Sur" })],
      [room(), room({ id: "r-2", deactivatedAt: created }), room({ id: "r-3", facilityId: "f-2" })],
    );
    expect(views.map((view) => [view.id, view.activeRooms])).toEqual([
      ["f-1", 1],
      ["f-2", 1],
    ]);
  });

  it("shows the hours as marks, 24:00 included, and the weekdays Monday first", () => {
    const [view] = toOperatorFacilityViews([facility()], []);
    expect(view).toMatchObject({ opensAt: "08:00", closesAt: "24:00", openWeekdays: [1, 5, 0], status: "active" });
  });

  it("writes instants in the sede's zone and marks a retired row inactive", () => {
    const view = toOperatorRoomView(
      room({ deactivatedAt: new Date("2026-02-01T15:00:00Z") }),
      "America/Argentina/Buenos_Aires",
    );
    expect(view.activeFrom).toBe("2026-01-01T09:00:00-03:00");
    expect(view).toMatchObject({ status: "inactive", deactivatedAt: "2026-02-01T12:00:00-03:00" });
  });

  it("names the room of a block, a retired one too, and derives its phase", () => {
    const block: BlockRecord = {
      id: "b-1",
      facilityId: "f-1",
      roomId: "r-2",
      startsAt: new Date("2030-01-07T12:00:00Z"),
      endsAt: new Date("2030-01-07T15:00:00Z"),
      reason: "Pintura",
      createdBy: "op",
      createdAt: created,
      releasedAt: null,
    };
    const rooms = [room({ id: "r-2", name: "Luna", deactivatedAt: created })];
    const [view, whole] = toOperatorBlockViews([block, { ...block, id: "b-2", roomId: null }], rooms, "UTC", created);
    expect(view).toMatchObject({
      room: { id: "r-2", name: "Luna" },
      startsAt: "2030-01-07T12:00:00+00:00",
      phase: "active",
    });
    expect(whole?.room).toBeNull();
  });

  it("hands a client without its record internals", () => {
    const view = toOperatorClientView({
      id: "c-1",
      name: "Acme",
      slug: "acme",
      kind: "company",
      logoUrl: null,
      createdAt: created,
      deactivatedAt: null,
    });
    expect(view).toEqual({
      id: "c-1",
      name: "Acme",
      slug: "acme",
      kind: "company",
      logoUrl: null,
      status: "active",
      deactivatedAt: null,
    });
  });
});
