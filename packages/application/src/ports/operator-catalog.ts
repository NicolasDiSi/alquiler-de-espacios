import type { AffectedBooking, FacilityRules } from "@espacios/domain";

/**
 * The operator's catalog (spec 0004): facilities, rooms, clients with their members, and blocks. Plain records, no
 * tenant: the operator edge reaches them through its own database login, never through a tenant transaction. Dates
 * travel as `Date` and serialize to ISO strings at the edge.
 */

export type FacilityRecord = FacilityRules & {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly createdAt: Date;
  readonly deactivatedAt: Date | null;
};
export type NewFacility = FacilityRules & {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
};
export type FacilityPatch = Partial<Omit<NewFacility, "id">>;

export type RoomRecord = {
  readonly id: string;
  readonly facilityId: string;
  readonly name: string;
  readonly capacity: number;
  /** Start of the window metrics count the room in; never moves back after creation. */
  readonly activeFrom: Date;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
};
export type NewRoom = Pick<RoomRecord, "id" | "facilityId" | "name" | "capacity" | "activeFrom">;
export type RoomPatch = Partial<Pick<RoomRecord, "name" | "capacity">>;

/** A client of the rental company. A person who works alone is an `individual` with one member. */
export const CLIENT_KINDS = ["company", "individual"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export type ClientRecord = {
  readonly id: string;
  readonly name: string;
  /** The client's code. Unique and never changed. */
  readonly slug: string;
  readonly kind: ClientKind;
  readonly logoUrl: string | null;
  readonly createdAt: Date;
  readonly deactivatedAt: Date | null;
};
export type NewClient = Pick<ClientRecord, "id" | "name" | "slug" | "kind" | "logoUrl">;
export type ClientPatch = Partial<Pick<ClientRecord, "name" | "logoUrl">>;

export type MemberRecord = { readonly id: string; readonly name: string; readonly createdAt: Date };
export type NewMember = Pick<MemberRecord, "id" | "name">;

export type BlockRecord = {
  readonly id: string;
  readonly facilityId: string;
  /** `null` closes every room of the facility. */
  readonly roomId: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Internal. Companies never see it. */
  readonly reason: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly releasedAt: Date | null;
};
export type NewBlock = Pick<
  BlockRecord,
  "id" | "facilityId" | "roomId" | "startsAt" | "endsAt" | "reason" | "createdBy"
>;
export type BlockFilter = { readonly facilityId?: string; readonly roomId?: string; readonly includeReleased: boolean };

/** Where a block applies: one room of the facility, or (`roomId` null) every room of it. */
export type BlockTarget = { readonly facilityId: string; readonly roomId: string | null };

/** Where to look for future confirmed bookings: one room, or every room of a facility. */
export type BookingScope = { readonly roomId: string } | { readonly facilityId: string };

/**
 * The same catalog inside one database transaction, with what a change that races with bookings needs (spec 0004,
 * P-16 to P-18). The lock calls take `FOR UPDATE` on the row, so an insert in flight (its guard trigger holds the row
 * `FOR SHARE`) finishes first and the reads that follow see it; a later insert waits and is refused by the trigger.
 * Take the lock before reading the bookings, and read before writing.
 */
export interface OperatorCatalogTransaction extends Omit<OperatorCatalog, "transaction"> {
  lockFacility(id: string): Promise<FacilityRecord | null>;
  lockRoom(id: string): Promise<RoomRecord | null>;
  lockClient(id: string): Promise<ClientRecord | null>;
  /** Confirmed bookings that start after `after`, soonest first, with room and company names. */
  futureBookings(scope: BookingScope, after: Date): Promise<readonly AffectedBooking[]>;
  /** Confirmed bookings of the scope that overlap `[startsAt, endsAt)`, soonest first. */
  overlappingBookings(scope: BookingScope, startsAt: Date, endsAt: Date): Promise<readonly AffectedBooking[]>;
  /**
   * Unreleased blocks that overlap `[startsAt, endsAt)` and close the same time as `target`: for a room, its own and
   * the whole sede's; for the whole sede, every block of the sede, whatever its room.
   */
  overlappingBlocks(target: BlockTarget, startsAt: Date, endsAt: Date): Promise<readonly BlockRecord[]>;
  countActiveRooms(facilityId: string): Promise<number>;
  /** Sets `deactivatedAt` (or clears it with `null`, only meant for clients). `null` result: no such row. */
  setFacilityDeactivation(id: string, at: Date | null): Promise<FacilityRecord | null>;
  setRoomDeactivation(id: string, at: Date): Promise<RoomRecord | null>;
  setClientDeactivation(id: string, at: Date | null): Promise<ClientRecord | null>;
}

export interface OperatorCatalog {
  /** Runs `work` in one transaction. A thrown error rolls it back; a returned value commits it. */
  transaction<T>(work: (tx: OperatorCatalogTransaction) => Promise<T>): Promise<T>;

  listFacilities(includeInactive: boolean): Promise<readonly FacilityRecord[]>;
  findFacility(id: string): Promise<FacilityRecord | null>;
  insertFacility(facility: NewFacility): Promise<FacilityRecord>;
  updateFacility(id: string, patch: FacilityPatch): Promise<FacilityRecord | null>;

  listRooms(filter: { facilityId?: string; includeInactive: boolean }): Promise<readonly RoomRecord[]>;
  findRoom(id: string): Promise<RoomRecord | null>;
  insertRoom(room: NewRoom): Promise<RoomRecord>;
  updateRoom(id: string, patch: RoomPatch): Promise<RoomRecord | null>;

  listClients(includeInactive: boolean): Promise<readonly ClientRecord[]>;
  findClient(id: string): Promise<ClientRecord | null>;
  /** The client and its first member in one transaction: a client never exists without a user. */
  insertClient(client: NewClient, firstMember: NewMember): Promise<{ client: ClientRecord; member: MemberRecord }>;
  updateClient(id: string, patch: ClientPatch): Promise<ClientRecord | null>;

  listMembers(clientId: string): Promise<readonly MemberRecord[]>;
  insertMember(clientId: string, member: NewMember): Promise<MemberRecord>;

  listBlocks(filter: BlockFilter): Promise<readonly BlockRecord[]>;
  findBlock(id: string): Promise<BlockRecord | null>;
  insertBlock(block: NewBlock): Promise<BlockRecord>;
  /** Sets `releasedAt`. `null` when the block does not exist; the use case already refused a released one. */
  releaseBlock(id: string, at: Date): Promise<BlockRecord | null>;
}
