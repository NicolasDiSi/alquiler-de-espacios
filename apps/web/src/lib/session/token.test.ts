import { describe, expect, it } from "vitest";

import { SESSION_TTL_SECONDS, signSession, verifySession } from "./token";

const SECRET = "a".repeat(32);
const NOW = new Date("2030-01-07T12:00:00Z");
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("session token", () => {
  it("round trips the user id while it is valid", () => {
    const value = signSession("user-acme-ana", SECRET, NOW);
    expect(verifySession(value, SECRET, NOW)).toBe("user-acme-ana");
    expect(verifySession(value, SECRET, later(SESSION_TTL_SECONDS - 1))).toBe("user-acme-ana");
  });

  it("signs the expiry: the value is userId.expiresAt.signature", () => {
    const [userId, expiresAt, signature] = signSession("user-acme-ana", SECRET, NOW).split(".");
    expect(userId).toBe("user-acme-ana");
    expect(Number(expiresAt)).toBe(NOW.getTime() / 1000 + SESSION_TTL_SECONDS);
    expect(signature).toMatch(/^[\w-]{43}$/);
  });

  it("refuses an expired value", () => {
    const value = signSession("user-acme-ana", SECRET, NOW);
    expect(verifySession(value, SECRET, later(SESSION_TTL_SECONDS))).toBeNull();
  });

  it("refuses a value signed with another secret", () => {
    const value = signSession("user-acme-ana", "b".repeat(32), NOW);
    expect(verifySession(value, SECRET, NOW)).toBeNull();
  });

  it("refuses a value whose user was swapped", () => {
    const value = signSession("user-acme-ana", SECRET, NOW);
    expect(verifySession(value.replace("user-acme-ana", "user-globex-carla"), SECRET, NOW)).toBeNull();
  });

  it("refuses a value whose expiry was pushed forward", () => {
    const [userId, expiresAt, signature] = signSession("user-acme-ana", SECRET, NOW).split(".");
    const forged = `${userId}.${Number(expiresAt) + 86_400}.${signature}`;
    expect(verifySession(forged, SECRET, NOW)).toBeNull();
  });

  it.each([
    ["empty", ""],
    ["no dots", "user-acme-ana"],
    ["no expiry", "user-acme-ana.signature"],
    ["leading dot", ".123.signature"],
    ["empty signature", "user-acme-ana.9999999999."],
  ])("refuses a malformed value (%s)", (_case, value) => {
    expect(verifySession(value, SECRET, NOW)).toBeNull();
  });

  it("refuses a signed value whose expiry is not a number", () => {
    // Signed by us but malformed: the expiry check must not coerce it.
    const value = signSession("user", SECRET, NOW);
    const [, , signature] = value.split(".");
    expect(verifySession(`user.abc.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("keeps a user id that itself contains a dot", () => {
    const value = signSession("user.with.dots", SECRET, NOW);
    expect(verifySession(value, SECRET, NOW)).toBe("user.with.dots");
  });
});
