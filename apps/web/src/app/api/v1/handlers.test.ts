import { NextRequest } from "next/server";

import type { DirectoryUser } from "@espacios/application";
import type { Result, TenantId, UserId } from "@espacios/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signSession } from "@/lib/session/token";

/**
 * The HTTP contract of `/api/v1` (docs/api/company.md and operator.md), through the real handlers, the real session
 * cookie and the real CSRF and role checks. Only the use cases and the composition root are replaced: what they do
 * against Postgres is proven in `packages/db`. Each case checks the status and the body, and that a refused request
 * never reaches the use case.
 */
const SECRET = "s".repeat(32);
const ACME = "company-acme" as TenantId;
const GLOBEX = "company-globex" as TenantId;

const users: Record<string, DirectoryUser> = {
  "user-ana": { role: "member", id: "user-ana" as UserId, name: "Ana", company: { id: ACME, name: "Acme" } },
  "user-op": { role: "operator", id: "user-op" as UserId, name: "Operador" },
};

const useCases = vi.hoisted(() => ({
  bookRoom: vi.fn(),
  listMyBookings: vi.fn(),
  cancelBooking: vi.fn(),
  createBlock: vi.fn(),
  listBlocks: vi.fn(),
  releaseBlock: vi.fn(),
}));

vi.mock("@espacios/application", async (original) => ({
  ...(await original<typeof import("@espacios/application")>()),
  ...useCases,
}));
vi.mock("@/composition", () => ({
  sessionSecret: () => SECRET,
  userDirectory: () => ({ findUser: async (id: string) => users[id] ?? null, listSignInChoices: vi.fn() }),
  companyEdge: () => ({}),
  operatorEdge: () => ({}),
  roomCatalog: () => ({ listRooms: async () => [{ id: "room-sol", name: "Sol", capacity: 6 }] }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations:
    async ({ namespace }: { namespace: string }) =>
    (key: string) =>
      `${namespace}.${key}`,
}));

const bookings = await import("./bookings/route");
const cancel = await import("./bookings/[id]/cancel/route");
const rooms = await import("./rooms/route");
const blocks = await import("./operator/blocks/route");
const release = await import("./operator/blocks/[id]/release/route");

const cookieOf = (userId: string, secret = SECRET, at = new Date()) =>
  `espacios_session=${signSession(userId, secret, at)}`;

type Init = {
  readonly as?: string | null;
  readonly cookie?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
};

function request(method: string, path: string, { as = "user-ana", cookie, body, headers = {} }: Init = {}) {
  const all: Record<string, string> = { host: "localhost:3000", ...headers };
  const session = cookie ?? (as ? cookieOf(as) : null);
  if (session) all.cookie = session;
  if (body !== undefined && !("content-type" in all)) all["content-type"] = "application/json";
  return new NextRequest(`http://localhost:3000/api/v1${path}`, {
    method,
    headers: all,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

const id = (value: string) => ({ params: Promise.resolve({ id: value }) });
const fail = (reason: string, extra: object = {}) => ({ ok: false, reason, ...extra }) as Result<never>;
const SLOT = { roomId: "room-sol", startsAt: "2030-01-08T10:00:00-03:00", endsAt: "2030-01-08T11:00:00-03:00" };

async function expectRefusal(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  // The reason and its catalog text, nothing else: no driver error, no other company's data.
  expect(await response.json()).toEqual({ code, message: `errors.${code}` });
}

beforeEach(() => {
  for (const spy of Object.values(useCases)) spy.mockReset();
});

describe("who gets in (signed cookie, role per edge)", () => {
  it("answers 401 with no cookie, a forged one, an expired one or a user that no longer exists", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const cookie of [
      undefined,
      cookieOf("user-ana", "x".repeat(32)),
      cookieOf("user-ana", SECRET, yesterday),
      cookieOf("user-gone"),
    ]) {
      await expectRefusal(
        await bookings.GET(request("GET", "/bookings", { as: null, ...(cookie ? { cookie } : {}) })),
        401,
        "unauthenticated",
      );
    }
    expect(useCases.listMyBookings).not.toHaveBeenCalled();
  });

  it("keeps the operator out of the company edge and a member out of the operator edge, with 403", async () => {
    await expectRefusal(
      await bookings.POST(request("POST", "/bookings", { as: "user-op", body: SLOT })),
      403,
      "forbidden",
    );
    await expectRefusal(await blocks.GET(request("GET", "/operator/blocks?facilityId=f-1")), 403, "forbidden");
    await expectRefusal(
      await release.POST(request("POST", "/operator/blocks/b-1/release", { body: {} }), id("b-1")),
      403,
      "forbidden",
    );
    expect(useCases.bookRoom).not.toHaveBeenCalled();
    expect(useCases.listBlocks).not.toHaveBeenCalled();
    expect(useCases.releaseBlock).not.toHaveBeenCalled();
  });

  it("lets both roles read the shared room list", async () => {
    for (const as of ["user-ana", "user-op"]) {
      const response = await rooms.GET(request("GET", "/rooms", { as }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ rooms: [{ id: "room-sol", name: "Sol", capacity: 6 }] });
    }
  });
});

describe("writes (CSRF and JSON)", () => {
  it("refuses a cross origin write with 403 and a body that is not JSON with 400, before the use case", async () => {
    const crossOrigin = request("POST", "/bookings", { body: SLOT, headers: { origin: "http://evil.test" } });
    await expectRefusal(await bookings.POST(crossOrigin), 403, "forbidden");
    const form = request("POST", "/bookings", { body: "roomId=room-sol", headers: { "content-type": "text/plain" } });
    await expectRefusal(await bookings.POST(form), 400, "invalid_input");
    expect(useCases.bookRoom).not.toHaveBeenCalled();
  });

  it("accepts a same origin write", async () => {
    useCases.bookRoom.mockResolvedValue({ ok: true, value: { booking: { id: "b-1" }, created: true } });
    const sameOrigin = request("POST", "/bookings", { body: SLOT, headers: { origin: "http://localhost:3000" } });
    expect((await bookings.POST(sameOrigin)).status).toBe(201);
  });
});

describe("POST /bookings", () => {
  it("books for the session's company, ignoring any company id in the body", async () => {
    useCases.bookRoom.mockResolvedValue({ ok: true, value: { booking: { id: "b-1" }, created: true } });
    await bookings.POST(request("POST", "/bookings", { body: { ...SLOT, companyId: GLOBEX, tenantId: GLOBEX } }));

    expect(useCases.bookRoom).toHaveBeenCalledOnce();
    const [, actor, input] = useCases.bookRoom.mock.calls[0] ?? [];
    expect(actor).toEqual({ role: "member", userId: "user-ana", tenantId: ACME });
    expect(input).toEqual({
      roomId: "room-sol",
      startsAt: new Date("2030-01-08T13:00:00Z"),
      endsAt: new Date("2030-01-08T14:00:00Z"),
    });
  });

  it("answers 201 with Location for a new booking and 200 without it for the exact repeat", async () => {
    useCases.bookRoom.mockResolvedValueOnce({ ok: true, value: { booking: { id: "b-1" }, created: true } });
    const created = await bookings.POST(request("POST", "/bookings", { body: SLOT }));
    expect(created.status).toBe(201);
    expect(created.headers.get("location")).toBe("/api/v1/bookings/b-1");
    expect(await created.json()).toEqual({ booking: { id: "b-1" }, message: "success.bookingConfirmed" });

    useCases.bookRoom.mockResolvedValueOnce({ ok: true, value: { booking: { id: "b-1" }, created: false } });
    const repeat = await bookings.POST(request("POST", "/bookings", { body: SLOT }));
    expect(repeat.status).toBe(200);
    expect(repeat.headers.get("location")).toBeNull();
  });

  it("answers 400 for a body it cannot read, without calling the use case", async () => {
    for (const body of ["{not json", { ...SLOT, startsAt: "2030-01-08T10:00:00" }, { roomId: "room-sol" }, []]) {
      await expectRefusal(await bookings.POST(request("POST", "/bookings", { body })), 400, "invalid_input");
    }
    expect(useCases.bookRoom).not.toHaveBeenCalled();
  });

  it.each([
    ["conflict", 409],
    ["room_blocked", 409],
    ["company_inactive", 403],
    ["past_date", 422],
    ["outside_hours", 422],
    ["not_found", 404],
  ] as const)("answers %s with %i and only the reason", async (reason, status) => {
    useCases.bookRoom.mockResolvedValue(fail(reason));
    await expectRefusal(await bookings.POST(request("POST", "/bookings", { body: SLOT })), status, reason);
  });

  it("answers busy with 503 and asks to retry after a second", async () => {
    useCases.bookRoom.mockResolvedValue(fail("busy"));
    const response = await bookings.POST(request("POST", "/bookings", { body: SLOT }));
    await expectRefusal(response, 503, "busy");
    expect(response.headers.get("retry-after")).toBe("1");
  });
});

describe("GET /bookings", () => {
  it("refuses an unknown view, a limit over 100 and a malformed cursor with 400", async () => {
    for (const query of ["?view=all", "?limit=101", "?cursor=not-a-cursor"]) {
      await expectRefusal(await bookings.GET(request("GET", `/bookings${query}`)), 400, "invalid_input");
    }
    expect(useCases.listMyBookings).not.toHaveBeenCalled();
  });

  it("lists for the session's company and never caches the answer", async () => {
    useCases.listMyBookings.mockResolvedValue({ ok: true, value: { bookings: [], next: null } });
    const response = await bookings.GET(request("GET", "/bookings?companyId=company-globex"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ bookings: [], nextCursor: null });
    expect(useCases.listMyBookings.mock.calls[0]?.[1]).toEqual({ role: "member", userId: "user-ana", tenantId: ACME });
  });
});

describe("POST /bookings/{id}/cancel", () => {
  it.each([
    ["not_found", 404],
    ["already_cancelled", 409],
    ["cancel_not_allowed", 422],
  ] as const)("answers %s with %i", async (reason, status) => {
    useCases.cancelBooking.mockResolvedValue(fail(reason));
    await expectRefusal(
      await cancel.POST(request("POST", "/bookings/b-1/cancel", { body: {} }), id("b-1")),
      status,
      reason,
    );
  });

  it("cancels the booking the path names, as the session's member", async () => {
    useCases.cancelBooking.mockResolvedValue({ ok: true, value: { id: "b-1", status: "cancelled" } });
    const response = await cancel.POST(request("POST", "/bookings/b-1/cancel", { body: {} }), id("b-1"));
    expect(response.status).toBe(200);
    expect(useCases.cancelBooking.mock.calls[0]?.slice(1)).toEqual([
      { role: "member", userId: "user-ana", tenantId: ACME },
      "b-1",
    ]);
  });
});

describe("operator blocks", () => {
  const BLOCK = {
    facilityId: "f-1",
    startsAt: "2030-01-08T10:00:00-03:00",
    endsAt: "2030-01-08T12:00:00-03:00",
    reason: "Obra",
  };

  it("refuses a body with an unknown key with 400 (strict bodies on the operator edge)", async () => {
    const body = { ...BLOCK, createdBy: "user-ana" };
    await expectRefusal(
      await blocks.POST(request("POST", "/operator/blocks", { as: "user-op", body })),
      400,
      "invalid_input",
    );
    expect(useCases.createBlock).not.toHaveBeenCalled();
  });

  it("creates a block for the whole sede when no room is given, 201 with Location", async () => {
    useCases.createBlock.mockResolvedValue({ ok: true, value: { id: "blk-1" } });
    const response = await blocks.POST(request("POST", "/operator/blocks", { as: "user-op", body: BLOCK }));
    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe("/api/v1/operator/blocks/blk-1");
    expect(useCases.createBlock.mock.calls[0]?.[2]).toMatchObject({ facilityId: "f-1", roomId: null });
  });

  it("answers block_has_bookings with 409 and the bookings in the way, dates as ISO", async () => {
    const inTheWay = {
      id: "b-1",
      roomId: "room-sol",
      roomName: "Sol",
      companyId: ACME,
      companyName: "Acme",
      startsAt: new Date("2030-01-08T13:00:00Z"),
      endsAt: new Date("2030-01-08T14:00:00Z"),
    };
    useCases.createBlock.mockResolvedValue(fail("block_has_bookings", { details: { total: 1, bookings: [inTheWay] } }));
    const response = await blocks.POST(request("POST", "/operator/blocks", { as: "user-op", body: BLOCK }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "block_has_bookings",
      message: "errors.block_has_bookings",
      details: {
        total: 1,
        bookings: [{ ...inTheWay, startsAt: "2030-01-08T13:00:00.000Z", endsAt: "2030-01-08T14:00:00.000Z" }],
      },
    });
  });

  it("answers a second release with already_released (409)", async () => {
    useCases.releaseBlock.mockResolvedValue(fail("already_released"));
    const response = await release.POST(
      request("POST", "/operator/blocks/b-1/release", { as: "user-op", body: {} }),
      id("b-1"),
    );
    await expectRefusal(response, 409, "already_released");
  });
});
