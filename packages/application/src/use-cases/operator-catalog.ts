import {
  type Actor,
  type AffectedBooking,
  authorizeOperator,
  changesBookingRules,
  type FacilityRules,
  fail,
  fitsFacilityRules,
  type OperatorActor,
  ok,
  type RefusalDetails,
  type Result,
  validateFacilityRules,
} from "@espacios/domain";

import type {
  BlockFilter,
  BlockRecord,
  ClientKind,
  ClientPatch,
  ClientRecord,
  FacilityPatch,
  FacilityRecord,
  MemberRecord,
  OperatorCatalog,
  RoomPatch,
  RoomRecord,
} from "../ports/operator-catalog";
import { BusyError, type Clock, type IdGenerator, MissingReferenceError, UniqueViolationError } from "../ports/ports";

/** What the operator edge's use cases need (spec 0004): the catalog on the operator login, the clock and ids. */
export type OperatorDependencies = {
  readonly catalog: OperatorCatalog;
  readonly clock: Clock;
  readonly ids: IdGenerator;
};

/**
 * Every operator use case starts here: only the operator passes (authorization is a business rule, `authorizeOperator`),
 * and a database refusal becomes a reason: a taken name or slug is `already_exists`, a missing reference `not_found`, a
 * database that could not answer in time `busy`. Anything else is a bug and is thrown on.
 */
async function asOperator<T>(actor: Actor, work: (operator: OperatorActor) => Promise<Result<T>>): Promise<Result<T>> {
  const operator = authorizeOperator(actor);
  if (!operator.ok) return operator;
  try {
    return await work(operator.value);
  } catch (error) {
    if (error instanceof UniqueViolationError) return fail("already_exists");
    if (error instanceof MissingReferenceError) return fail("not_found");
    if (error instanceof BusyError) return fail("busy");
    throw error;
  }
}

/** How many affected bookings a refusal lists (spec 0004, AC-5). The total always counts them all. */
export const AFFECTED_BOOKINGS_LIMIT = 50;

function detailsOf(bookings: readonly AffectedBooking[]): RefusalDetails {
  return { total: bookings.length, bookings: bookings.slice(0, AFFECTED_BOOKINGS_LIMIT) };
}

const found = <T>(record: T | null): Result<T> => (record ? ok(record) : fail("not_found"));

// Facilities ---------------------------------------------------------------------------------------------------------

export type CreateFacilityInput = FacilityRules & { readonly name: string; readonly address: string | null };

export function createFacility(deps: OperatorDependencies, actor: Actor, input: CreateFacilityInput) {
  return asOperator(actor, async (): Promise<Result<FacilityRecord>> => {
    const rules = validateFacilityRules(input);
    if (!rules.ok) return rules;
    return ok(await deps.catalog.insertFacility({ id: deps.ids.next(), ...input }));
  });
}

export function listFacilities(deps: OperatorDependencies, actor: Actor, includeInactive: boolean) {
  return asOperator(actor, async () => ok(await deps.catalog.listFacilities(includeInactive)));
}

export function getFacility(deps: OperatorDependencies, actor: Actor, id: string) {
  return asOperator(actor, async () => found(await deps.catalog.findFacility(id)));
}

export function updateFacility(deps: OperatorDependencies, actor: Actor, id: string, patch: FacilityPatch) {
  return asOperator(actor, () =>
    deps.catalog.transaction(async (tx): Promise<Result<FacilityRecord>> => {
      const current = await tx.lockFacility(id);
      if (!current) return fail("not_found");
      const next = { ...current, ...patch };
      const rules = validateFacilityRules(next);
      if (!rules.ok) return rules;
      // A change of zone, hours or open days must not strand a booking that is already confirmed (AC-6).
      if (changesBookingRules(current, next)) {
        const stranded = (await tx.futureBookings({ facilityId: id }, deps.clock.now())).filter(
          (booking) => !fitsFacilityRules(booking, next),
        );
        if (stranded.length > 0) return fail("has_future_bookings", detailsOf(stranded));
      }
      return found(await tx.updateFacility(id, patch));
    }),
  );
}

/**
 * Switches a facility off. It must have no active room (deactivate them first), and it never reopens. Doing it twice
 * is not an error: it answers the facility as it is.
 */
export function deactivateFacility(deps: OperatorDependencies, actor: Actor, id: string) {
  return asOperator(actor, () =>
    deps.catalog.transaction(async (tx): Promise<Result<FacilityRecord>> => {
      const facility = await tx.lockFacility(id);
      if (!facility) return fail("not_found");
      if (facility.deactivatedAt) return ok(facility);
      if ((await tx.countActiveRooms(id)) > 0) return fail("facility_has_active_rooms");
      return found(await tx.setFacilityDeactivation(id, deps.clock.now()));
    }),
  );
}

// Rooms --------------------------------------------------------------------------------------------------------------

export type CreateRoomInput = {
  readonly facilityId: string;
  readonly name: string;
  readonly capacity: number;
  /** Backfills history; the creation instant when absent. */
  readonly activeFrom?: Date;
};

export function createRoom(deps: OperatorDependencies, actor: Actor, input: CreateRoomInput) {
  return asOperator(actor, () =>
    deps.catalog.transaction(async (tx): Promise<Result<RoomRecord>> => {
      // The lock makes a facility deactivation that is racing with this insert go first or wait for it.
      const facility = await tx.lockFacility(input.facilityId);
      if (!facility) return fail("not_found");
      if (facility.deactivatedAt) return fail("facility_inactive");
      if (!Number.isInteger(input.capacity) || input.capacity < 1) return fail("invalid_input");
      const { activeFrom = deps.clock.now(), ...rest } = input;
      return ok(await tx.insertRoom({ id: deps.ids.next(), ...rest, activeFrom }));
    }),
  );
}

export function listRooms(
  deps: OperatorDependencies,
  actor: Actor,
  filter: { facilityId?: string; includeInactive: boolean },
) {
  return asOperator(actor, async () => ok(await deps.catalog.listRooms(filter)));
}

export function getRoom(deps: OperatorDependencies, actor: Actor, id: string) {
  return asOperator(actor, async () => found(await deps.catalog.findRoom(id)));
}

export function updateRoom(deps: OperatorDependencies, actor: Actor, id: string, patch: RoomPatch) {
  return asOperator(actor, async (): Promise<Result<RoomRecord>> => {
    if (patch.capacity !== undefined && (!Number.isInteger(patch.capacity) || patch.capacity < 1)) {
      return fail("invalid_input");
    }
    return found(await deps.catalog.updateRoom(id, patch));
  });
}

/**
 * Switches a room off for good: its window ends now and nobody can book it. Refused while confirmed bookings start
 * later, and the refusal lists them (AC-5). Doing it twice answers the room as it is.
 */
export function deactivateRoom(deps: OperatorDependencies, actor: Actor, id: string) {
  return asOperator(actor, () =>
    deps.catalog.transaction(async (tx): Promise<Result<RoomRecord>> => {
      const room = await tx.lockRoom(id);
      if (!room) return fail("not_found");
      if (room.deactivatedAt) return ok(room);
      const now = deps.clock.now();
      const future = await tx.futureBookings({ roomId: id }, now);
      if (future.length > 0) return fail("has_future_bookings", detailsOf(future));
      return found(await tx.setRoomDeactivation(id, now));
    }),
  );
}

// Clients and their members ------------------------------------------------------------------------------------------

export type CreateClientInput = {
  readonly name: string;
  readonly slug: string;
  readonly kind: ClientKind;
  readonly logoUrl: string | null;
  /** The first member. For an individual it defaults to the client's name; a company must name it. */
  readonly memberName?: string;
};

export function createClient(deps: OperatorDependencies, actor: Actor, input: CreateClientInput) {
  return asOperator(actor, async (): Promise<Result<{ client: ClientRecord; member: MemberRecord }>> => {
    const { memberName, ...client } = input;
    const firstMember = memberName ?? (client.kind === "individual" ? client.name : undefined);
    if (!firstMember) return fail("invalid_input");
    return ok(
      await deps.catalog.insertClient({ id: deps.ids.next(), ...client }, { id: deps.ids.next(), name: firstMember }),
    );
  });
}

export function listClients(deps: OperatorDependencies, actor: Actor, includeInactive: boolean) {
  return asOperator(actor, async () => ok(await deps.catalog.listClients(includeInactive)));
}

export function getClient(deps: OperatorDependencies, actor: Actor, id: string) {
  return asOperator(actor, async () => found(await deps.catalog.findClient(id)));
}

export function updateClient(deps: OperatorDependencies, actor: Actor, id: string, patch: ClientPatch) {
  return asOperator(actor, async () => found(await deps.catalog.updateClient(id, patch)));
}

export function listMembers(deps: OperatorDependencies, actor: Actor, clientId: string) {
  return asOperator(actor, async (): Promise<Result<readonly MemberRecord[]>> => {
    if (!(await deps.catalog.findClient(clientId))) return fail("not_found");
    return ok(await deps.catalog.listMembers(clientId));
  });
}

export function addMember(deps: OperatorDependencies, actor: Actor, clientId: string, name: string) {
  return asOperator(actor, async (): Promise<Result<MemberRecord>> => {
    const client = await deps.catalog.findClient(clientId);
    if (!client) return fail("not_found");
    // A person who works alone has one member. Growing into a company means adding members to the same client.
    if (client.kind === "individual" && (await deps.catalog.listMembers(clientId)).length >= 1) {
      return fail("individual_is_single");
    }
    return ok(await deps.catalog.insertMember(clientId, { id: deps.ids.next(), name }));
  });
}

/** Its members can no longer book (`company_inactive`) but keep their history and can still cancel (AC-7). */
export function deactivateClient(deps: OperatorDependencies, actor: Actor, id: string) {
  return asOperator(actor, () =>
    deps.catalog.transaction(async (tx): Promise<Result<ClientRecord>> => {
      const client = await tx.lockClient(id);
      if (!client) return fail("not_found");
      if (client.deactivatedAt) return ok(client);
      return found(await tx.setClientDeactivation(id, deps.clock.now()));
    }),
  );
}

/** Unlike rooms, a client can come back: no metric depends on its window. */
export function reactivateClient(deps: OperatorDependencies, actor: Actor, id: string) {
  return asOperator(actor, () =>
    deps.catalog.transaction(async (tx): Promise<Result<ClientRecord>> => {
      const client = await tx.lockClient(id);
      if (!client) return fail("not_found");
      if (!client.deactivatedAt) return ok(client);
      return found(await tx.setClientDeactivation(id, null));
    }),
  );
}

// Blocks -------------------------------------------------------------------------------------------------------------

export type CreateBlockInput = {
  readonly facilityId: string;
  readonly roomId: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly reason: string;
};

export function createBlock(deps: OperatorDependencies, actor: Actor, input: CreateBlockInput) {
  return asOperator(actor, async (operator) => {
    if (input.endsAt.getTime() <= input.startsAt.getTime()) return fail("invalid_range");
    if (input.endsAt.getTime() <= deps.clock.now().getTime()) return fail("past_date");

    return deps.catalog.transaction(async (tx): Promise<Result<BlockRecord>> => {
      // The facility lock waits for bookings in flight, so the list below is complete (AC-18, P-18).
      const facility = await tx.lockFacility(input.facilityId);
      if (!facility) return fail("not_found");
      if (facility.deactivatedAt) return fail("facility_inactive");
      if (input.roomId !== null) {
        const room = await tx.findRoom(input.roomId);
        if (!room) return fail("not_found");
        if (room.facilityId !== facility.id) return fail("invalid_input");
        if (room.deactivatedAt) return fail("room_inactive");
      }
      const scope = input.roomId === null ? { facilityId: facility.id } : { roomId: input.roomId };
      const covered = await tx.overlappingBookings(scope, input.startsAt, input.endsAt);
      if (covered.length > 0) return fail("block_has_bookings", detailsOf(covered));
      return ok(await tx.insertBlock({ id: deps.ids.next(), ...input, createdBy: operator.userId }));
    });
  });
}

export function listBlocks(deps: OperatorDependencies, actor: Actor, filter: BlockFilter) {
  return asOperator(actor, async () => ok(await deps.catalog.listBlocks(filter)));
}

export function getBlock(deps: OperatorDependencies, actor: Actor, id: string) {
  return asOperator(actor, async () => found(await deps.catalog.findBlock(id)));
}

/** A block is never edited or deleted: releasing sets `releasedAt` and it stops blocking at once. */
export function releaseBlock(deps: OperatorDependencies, actor: Actor, id: string) {
  return asOperator(actor, async (): Promise<Result<BlockRecord>> => {
    const block = await deps.catalog.findBlock(id);
    if (!block) return fail("not_found");
    if (block.releasedAt) return fail("already_released");
    return found(await deps.catalog.releaseBlock(id, deps.clock.now()));
  });
}
