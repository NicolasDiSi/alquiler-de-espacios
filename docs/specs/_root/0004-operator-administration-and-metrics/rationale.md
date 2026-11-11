# 0004 Rationale: operator administration, facilities and metrics

## Context

Spec 0001 decided the booking platform: companies as tenants, a shared `room` table, the overlap exclusion constraint and three metric definitions. It treated rooms and companies as seed data and the operator as a reader. The brief says the business starts with three rooms and a few clients and expects more facilities and companies later, and the operator needs an overview of use and of each client. That needs a way to add and retire facilities, rooms and companies, and metrics that stay true while the set of rooms changes.

Three forces shape the design. First, history must not disappear: bookings and reports refer to rooms and companies that may later be switched off. Second, the operator edge runs on a read only database login, so writing catalog data is a real change to the security model. Third, two requests can race (a booking against a deactivation), and the project already treats such races as database problems, not code problems.

The engineer also asked for the time zone to come from the facility and not from a constant, and chose hours and weekdays per facility too, so the model does not need to change when a second city arrives.

## Options considered

### Option 1: Extend the schema in place (chosen)

Add `facility`, add `facility_id`, `active_from` and `deactivated_at` to `room`, add `deactivated_at` to `company`, grant the operator login write access to those three tables only, and guard bookings with a trigger.

**Pros**:
- Smallest change over built and tested work; `booking` does not change.
- Soft deactivation keeps history and metrics.
- The race is closed by the database, matching the overlap rule.
- Reuses ports, use cases and the operator edge.

**Cons**:
- Touches the booking rules and the calendar helpers that today use constants.
- Widens the operator login.
- A room window is one interval, so no reopening in v1.

### Option 2: A separate admin service or schema

A second login and service (`espacios_admin`) for all writes, apart from the operator reader.

**Pros**:
- Strict least privilege: the reader stays read only.

**Cons**:
- A fourth login, more configuration and wiring for a three table need.
- Overkill for one app in a 72 hour challenge.

### Option 3: Keep rooms as seed data, add only metrics

Do not build administration, only the metrics.

**Pros**:
- Fastest.

**Cons**:
- Fails "growth" in the brief: adding a room would need SQL.
- Leaves the operator unable to manage the platform the metrics describe.

### Option 4: Hard delete and global constants

Delete rows on removal and keep one zone and one set of hours.

**Pros**:
- Simplest model and queries.

**Cons**:
- Deleting breaks bookings and reports; the engineer explicitly asked for logical deactivation and per facility time zone.

## Rationale

Option 1 fits the constraints. The business needs growth now but not a new service, and the existing architecture already has a second edge for the operator. Widening the operator login to three catalog tables is the least change that works, and the harm is bounded: no tenant table can be written, and every write passes a use case that checks the role first. Option 2 is the stricter design and is the first thing to adopt if the operator ever needs more than catalog writes.

Soft deactivation with `deactivated_at` serves both the reports and the audit story. Rejecting a deactivation that would strand future bookings, and returning the list, gives the operator the information to act, and the engineer's idea of a notification action fits as a later step on that same list. Keeping one window per room and forbidding reopening keeps the occupancy math simple and honest: open minutes are counted only while the room could be booked.

Putting hours and zone on the facility follows the engineer's choice and costs a refactor of constants into inputs, which is a mechanical change guarded by the existing tests (AC-16). The trigger exists because the use case alone cannot close a race between two connections; row locks with `FOR SHARE` make a deactivation or an hours change wait for in flight bookings, and the trigger refuses the ones that arrive after. This repeats the lesson of spec 0001: when two requests can break a rule together, the database holds the rule.

Blocks are a separate table, not a fake booking, because a block answers a different question ("why can nobody use this room") and must stay invisible to companies, while bookings are tenant data under row level security. A fake booking would need a tenant and would show up in a company's list or in the usage metrics. A block can cover a whole facility with one row (holidays, closures), so `room_id` is nullable instead of copying one row per room. The overlap with bookings cannot be an exclusion constraint (it spans two tables), so the same lock and trigger used for deactivation close that race. Blocked time leaves the occupancy denominator because the room could not be booked then; counting it as open would punish the operator's own maintenance in the numbers.

Runner up: Option 2, if the operator gains more write power later.

## References

**Project sources**:
- [Spec 0001](../0001-booking-platform-architecture/index.md): roles, data model, metrics, error contract, API surface.
- [Spec 0003](../0003-booking-form-my-bookings/index.md): booking form and list, the built rules this spec parameterizes.
- ADR 0003 (Prisma multitenancy) and `packages/db/AGENTS.md`: the three database logins this spec amends.
- Local skills `multi-tenant-safety`, `use-case-recipe`, `pattern-catalog`, `bff-edges`.
