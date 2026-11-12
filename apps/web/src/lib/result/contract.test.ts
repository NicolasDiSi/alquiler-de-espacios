import { fail, ok, REASONS } from "@espacios/domain";
import { describe, expect, it } from "vitest";

import messages from "../../../messages/es.json";
import { toActionResult } from "./action-result";
import { failureResponse, reasonToHttp } from "./http";

const errors: Record<string, string> = messages.errors;

describe("the error contract (spec 0001, P-6)", () => {
  it.each(REASONS)("maps %s to one HTTP status and one Spanish message", (reason) => {
    expect([400, 401, 403, 404, 409, 422, 503]).toContain(reasonToHttp(reason));
    expect(errors[reason]?.trim()).toBeTruthy();
  });

  it("has a message for every reason and no message for a reason that does not exist", () => {
    expect(Object.keys(errors).sort()).toEqual([...REASONS].sort());
  });

  it("follows the status table of the spec", () => {
    const byStatus: Record<string, string[]> = {};
    for (const reason of REASONS) {
      const status = String(reasonToHttp(reason));
      byStatus[status] = [...(byStatus[status] ?? []), reason];
    }
    expect(byStatus).toEqual({
      "400": ["invalid_input"],
      "401": ["unauthenticated"],
      "403": ["company_inactive", "forbidden"],
      "404": ["not_found"],
      "409": [
        "conflict",
        "already_exists",
        "has_future_bookings",
        "block_has_bookings",
        "facility_has_active_rooms",
        "facility_inactive",
        "individual_is_single",
        "already_released",
        "room_inactive",
        "room_blocked",
        "already_cancelled",
      ],
      "422": [
        "not_on_grid",
        "outside_hours",
        "invalid_range",
        "too_short",
        "too_long",
        "past_date",
        "beyond_horizon",
        "cancel_not_allowed",
      ],
      "503": ["busy"],
    });
  });

  it("has the success messages the booking actions show", () => {
    expect(messages.success).toEqual({ bookingConfirmed: "Reserva confirmada", bookingCancelled: "Reserva cancelada" });
  });
});

describe("failureResponse", () => {
  it("answers { code, message } with the reason's status and no caching", async () => {
    const response = failureResponse("conflict", errors.conflict as string);
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBeNull();
    await expect(response.json()).resolves.toEqual({ code: "conflict", message: errors.conflict });
  });

  it("asks the client to retry a busy answer after one second", () => {
    const response = failureResponse("busy", errors.busy as string);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("1");
  });
});

describe("failureResponse with bookings in the way", () => {
  it("adds details with ISO dates for has_future_bookings", async () => {
    const booking = {
      id: "b-1",
      roomId: "r-1",
      roomName: "Sala 1",
      companyName: "Acme",
      startsAt: new Date("2030-01-07T12:00:00Z"),
      endsAt: new Date("2030-01-07T13:00:00Z"),
    };
    const response = failureResponse("has_future_bookings", errors.has_future_bookings as string, {
      total: 1,
      bookings: [booking],
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "has_future_bookings",
      message: errors.has_future_bookings,
      details: {
        total: 1,
        bookings: [{ ...booking, startsAt: "2030-01-07T12:00:00.000Z", endsAt: "2030-01-07T13:00:00.000Z" }],
      },
    });
  });
});

describe("toActionResult", () => {
  const errorMessage = (reason: string) => `errors.${reason}`;

  it("adds the success message to a success", () => {
    expect(toActionResult(ok({ id: "b-1" }), "Reserva confirmada", errorMessage)).toEqual({
      ok: true,
      value: { id: "b-1" },
      message: "Reserva confirmada",
    });
  });

  it("adds the catalog message of the reason to a failure", () => {
    expect(toActionResult(fail("past_date"), "Reserva confirmada", errorMessage)).toEqual({
      ok: false,
      reason: "past_date",
      message: "errors.past_date",
    });
  });
});
