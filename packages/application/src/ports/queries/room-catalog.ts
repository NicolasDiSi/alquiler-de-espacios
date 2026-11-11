import type { FacilityRules } from "@espacios/domain";

/** The facility a room belongs to: its name, and the zone, hours and open days every rule about the room reads. */
export type FacilityView = FacilityRules & {
  readonly id: string;
  readonly name: string;
};

/** A room as every signed in user sees it. Rooms are shared and read only for companies. */
export type RoomView = {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  /** False when the room, or its facility, was deactivated (spec 0004): it takes no new bookings. */
  readonly active: boolean;
  readonly facility: FacilityView;
};

export interface RoomCatalog {
  /** Every room that takes bookings (room and facility active), by name. A handful in v1, so no pagination. */
  listRooms(): Promise<readonly RoomView[]>;
  /** One room, active or not, or `null` when no room has that id. The use case decides what an inactive one means. */
  findRoom(id: string): Promise<RoomView | null>;
}
