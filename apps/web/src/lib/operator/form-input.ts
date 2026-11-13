import { CLIENT_KINDS } from "@espacios/application";
import { z } from "zod";

import { minutesOf } from "./format";

/**
 * What each operator form posts (spec 0005), read by Zod into the use case's input. They check the shape only; the
 * rules (a real zone, hours on the marks, one member for an individual) belong to the use cases. Every field is a
 * string as the browser sends it, and an empty optional field means "not given".
 */

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);
const minutes = z.string().transform(minutesOf).pipe(z.number().int());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => value || null)
  .pipe(z.url({ protocol: /^https$/ }).nullable());

export const idForm = z.object({ id: text(128) });

export const facilityForm = z.object({
  name: text(100),
  address: optionalText(200),
  timeZone: text(64),
  opensAt: minutes,
  closesAt: minutes,
  openWeekdays: z.string().transform((csv) => csv.split(",").filter(Boolean).map(Number)),
});
export const facilityEditForm = facilityForm.extend({ id: text(128) });

export const roomCreateForm = z.object({
  facilityId: text(128),
  name: text(100),
  capacity: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number),
  activeFrom: z.union([day, z.literal("")]).transform((value) => value || undefined),
});
export const roomEditForm = z.object({
  id: text(128),
  name: text(100),
  capacity: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number),
});

export const blockForm = z.object({
  facilityId: text(128),
  roomId: z
    .string()
    .trim()
    .max(128)
    .transform((value) => value || null),
  startDate: day,
  startTime: time.or(z.literal("24:00")),
  endDate: day,
  endTime: time.or(z.literal("24:00")),
  reason: text(200),
});

export const clientCreateForm = z.object({
  kind: z.enum(CLIENT_KINDS),
  name: text(100),
  slug: z
    .string()
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  logoUrl: httpsUrl,
  // An individual has no first member field, so the browser sends no key at all.
  memberName: optionalText(100)
    .optional()
    .transform((value) => value ?? undefined),
});
export const clientEditForm = z.object({ id: text(128), name: text(100), logoUrl: httpsUrl });

export const memberForm = z.object({ clientId: text(128), name: text(100) });
