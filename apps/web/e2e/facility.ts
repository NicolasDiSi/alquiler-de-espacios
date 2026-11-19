import { type FacilityRules, startTimes } from "@espacios/domain";

/**
 * The seeded facility ("Sede Central", created by the migration): Monday to Friday, 08:00 to 20:00, Buenos Aires. The
 * e2e helpers pick free slots by its rules, the way the form reads them from the room's facility (spec 0004).
 */
export const CENTRAL: FacilityRules = {
  timeZone: "America/Argentina/Buenos_Aires",
  opensAt: 8 * 60,
  closesAt: 20 * 60,
  openWeekdays: [1, 2, 3, 4, 5],
};

export const START_TIMES = startTimes(CENTRAL);
