/**
 * What a facility decides about its rooms (spec 0004): the time zone every rule reads days and clocks in, the opening
 * hours as minutes since local midnight, and the weekdays it opens (0 Sunday to 6 Saturday, as `Date.getDay`). The
 * slot grid, the length limits and the horizon are not here: they are global (`BOOKING_RULES`).
 */
export type FacilityRules = {
  readonly timeZone: string;
  readonly opensAt: number;
  readonly closesAt: number;
  readonly openWeekdays: readonly number[];
};
