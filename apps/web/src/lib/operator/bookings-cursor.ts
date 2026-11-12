import type { OperatorBookingPosition } from "@espacios/application";
import { z } from "zod";

/**
 * The opaque page cursor of the operator's bookings list (spec 0004, AC-10): base64url of `{ now, run, startsAt, id }`.
 * `now` is pinned so a booking never moves between the upcoming and past runs while paging. It holds no company data.
 */
const cursorSchema = z.object({
  now: z.iso.datetime(),
  run: z.enum(["upcoming", "past"]),
  startsAt: z.iso.datetime(),
  id: z.string().min(1).max(128),
});

export function encodeOperatorCursor(position: OperatorBookingPosition): string {
  const payload = {
    now: position.now.toISOString(),
    run: position.run,
    startsAt: position.startsAt.toISOString(),
    id: position.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** The position inside `cursor`, or `null` when it is malformed (`invalid_input`). */
export function decodeOperatorCursor(cursor: string): OperatorBookingPosition | null {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = cursorSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { now, run, startsAt, id } = parsed.data;
  return { now: new Date(now), run, startsAt: new Date(startsAt), id };
}
