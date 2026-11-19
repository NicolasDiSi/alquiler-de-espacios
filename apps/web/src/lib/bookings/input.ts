import { MY_BOOKINGS_PAGE, MY_BOOKINGS_VIEWS } from "@espacios/application";
import { type BookingPeriod, parseLocalDate, parseTime, zonedInstant } from "@espacios/domain";
import { z } from "zod";

/** Seeded and generated ids are far shorter; anything longer is not an id. */
const MAX_ID_LENGTH = 128;

const id = z.string().trim().min(1).max(MAX_ID_LENGTH);

/** The four fields the booking form posts (spec 0003): a day `YYYY-MM-DD` and two `HH:mm` marks. */
export const BOOKING_FORM_FIELDS = ["roomId", "date", "start", "end"] as const;
export type BookingFormField = (typeof BOOKING_FORM_FIELDS)[number];
export type BookingFormValues = Record<BookingFormField, string>;

const bookingFormSchema = z.object({
  roomId: id,
  date: z.string().refine((value) => parseLocalDate(value) !== null),
  start: z.string().refine((value) => parseTime(value) !== null),
  end: z.string().refine((value) => parseTime(value) !== null),
});

export type ParsedBooking = BookingPeriod & { readonly roomId: string };

export type ParseResult =
  | { readonly ok: true; readonly value: ParsedBooking }
  | { readonly ok: false; readonly invalidFields: readonly BookingFormField[] };

/** The fields named by the Zod error paths, in form order. */
function fieldsOf(error: z.ZodError): BookingFormField[] {
  const paths = new Set(error.issues.map((issue) => issue.path[0]));
  return BOOKING_FORM_FIELDS.filter((field) => paths.has(field));
}

/**
 * The form's values to the booking's two instants, built on the server in the room's facility zone (spec 0004). A time
 * off the 30 minute marks still parses, so the use case can answer with its own reason (`not_on_grid`).
 */
export function parseBookingForm(
  values: BookingFormValues,
  /** The zone of the room's facility (spec 0004), or `undefined` for a room that does not exist. */
  timeZoneOf: (roomId: string) => string | undefined,
): ParseResult {
  const parsed = bookingFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, invalidFields: fieldsOf(parsed.error) };
  const { roomId, date, start, end } = parsed.data;
  // Both checks passed in the schema, so neither is null here.
  const day = parseLocalDate(date) as NonNullable<ReturnType<typeof parseLocalDate>>;
  // An unknown room has no zone. The use case answers `not_found` for it before it reads the instants, so UTC only
  // keeps this function total.
  const timeZone = timeZoneOf(roomId) ?? "UTC";
  return {
    ok: true,
    value: {
      roomId,
      startsAt: zonedInstant(day, parseTime(start) ?? 0, timeZone),
      endsAt: zonedInstant(day, parseTime(end) ?? 0, timeZone),
    },
  };
}

/** `POST /api/v1/bookings`: RFC 3339 instants that must carry an offset (`Z` or `-03:00`). */
const bookingRequestSchema = z.object({
  roomId: id,
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
});

export function parseBookingRequest(body: unknown): ParsedBooking | null {
  const parsed = bookingRequestSchema.safeParse(body);
  if (!parsed.success) return null;
  const { roomId, startsAt, endsAt } = parsed.data;
  return { roomId, startsAt: new Date(startsAt), endsAt: new Date(endsAt) };
}

/** `GET /api/v1/bookings` query: `view`, `cursor`, `limit` (spec 0003, AC-14). */
export const listQuerySchema = z.object({
  view: z.enum(MY_BOOKINGS_VIEWS).default("upcoming"),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MY_BOOKINGS_PAGE.maxLimit).default(MY_BOOKINGS_PAGE.defaultLimit),
});
