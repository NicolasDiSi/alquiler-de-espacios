import { type BookingPosition, MY_BOOKINGS_VIEWS, type MyBookingsView } from "@espacios/application";
import { z } from "zod";

/**
 * The opaque page cursor of spec 0003: base64url of `{ view, startsAt, id }`. The company is never in it; it always
 * comes from the session, so a cursor copied from another company only moves a position in the caller's own list.
 */
const cursorSchema = z.object({
  view: z.enum(MY_BOOKINGS_VIEWS),
  startsAt: z.iso.datetime(),
  id: z.string().min(1).max(128),
});

export function encodeCursor(view: MyBookingsView, position: BookingPosition): string {
  const payload = { view, startsAt: position.startsAt.toISOString(), id: position.id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** The position inside `cursor`, or `null` when it is malformed or belongs to another view (`invalid_input`). */
export function decodeCursor(cursor: string, view: MyBookingsView): BookingPosition | null {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = cursorSchema.safeParse(payload);
  if (!parsed.success || parsed.data.view !== view) return null;
  return { startsAt: new Date(parsed.data.startsAt), id: parsed.data.id };
}
