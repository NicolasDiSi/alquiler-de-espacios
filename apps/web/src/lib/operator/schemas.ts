import { CLIENT_KINDS } from "@espacios/application";
import { INSIGHT_THRESHOLDS, type LocalDate, parseLocalDate } from "@espacios/domain";
import { z } from "zod";

/**
 * The operator API's inputs (spec 0004), each one Zod schema, with its type inferred. They check the shape only; the
 * rules (a real zone, hours on the marks, one member for an individual) are the use cases'. Unknown keys are refused.
 */

const text = (max: number) => z.string().trim().min(1).max(max);
const id = text(128);
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const httpsUrl = z
  .url()
  .max(2048)
  .refine((value) => value.startsWith("https://"), "https only");

export const facilityBody = z.strictObject({
  name: text(100),
  address: text(200).nullable().optional(),
  timeZone: text(64),
  opensAt: z.number().int(),
  closesAt: z.number().int(),
  openWeekdays: z.array(z.number().int()).max(7),
});
export const facilityPatch = facilityBody.partial();

export const roomBody = z.strictObject({
  facilityId: id,
  name: text(100),
  capacity: z.number().int(),
  activeFrom: instant.optional(),
});
export const roomPatch = z.strictObject({ name: text(100).optional(), capacity: z.number().int().optional() });

export const clientBody = z.strictObject({
  name: text(100),
  slug: z
    .string()
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: z.enum(CLIENT_KINDS),
  logoUrl: httpsUrl.nullable().optional(),
  member: z.strictObject({ name: text(100) }).optional(),
});
export const clientPatch = z.strictObject({ name: text(100).optional(), logoUrl: httpsUrl.nullable().optional() });

export const memberBody = z.strictObject({ name: text(100) });

export const blockBody = z.strictObject({
  facilityId: id,
  roomId: id.nullable().optional(),
  startsAt: instant,
  endsAt: instant,
  reason: text(200),
});

/** Query strings: `?includeInactive=true`, `?facilityId=`, `?includeReleased=true`. */
const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
export const inactiveQuery = z.object({ includeInactive: flag });
export const roomsQuery = z.object({ includeInactive: flag, facilityId: id.optional() });
export const blocksQuery = z.object({ includeReleased: flag, facilityId: id.optional(), roomId: id.optional() });

/** `GET /operator/bookings` filters (AC-10). `from` and `to` are instants with an offset, bounding `startsAt`: `[from, to)`. */
export const bookingsQuery = z.object({
  companyId: id.optional(),
  roomId: id.optional(),
  facilityId: id.optional(),
  status: z.enum(["confirmed", "cancelled"]).optional(),
  from: instant.optional(),
  to: instant.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** A metric range: inclusive local days `YYYY-MM-DD`, each read in its facility's zone. A day that does not exist is 400. */
const localDay = z.string().transform((value, ctx) => {
  const day = parseLocalDate(value);
  if (!day) ctx.addIssue({ code: "custom", message: "not a day" });
  return day ?? ("" as LocalDate);
});
const metricRange = { from: localDay, to: localDay };
export const roomMetricsQuery = z.object(metricRange);
export const companyMetricsQuery = z.object({ ...metricRange, kind: z.enum(CLIENT_KINDS).optional() });
export const heatmapQuery = z.object({ ...metricRange, facilityId: id.optional(), roomId: id.optional() });
export const insightsQuery = z.object({
  ...metricRange,
  lowOccupancy: z.coerce.number().min(0).max(1).default(INSIGHT_THRESHOLDS.lowOccupancy),
});
