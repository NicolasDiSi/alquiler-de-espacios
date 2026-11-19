import { createHmac, timingSafeEqual } from "node:crypto";

/** Eight hours, the cookie's `maxAge` and the expiry signed inside its value (spec 0001, Security model). */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** HMAC keys shorter than this are refused, so a weak `SESSION_SECRET` fails loudly instead of signing weakly. */
export const MIN_SECRET_BYTES = 32;

/**
 * The cookie value is `userId.expiresAt.signature`: `expiresAt` in unix seconds and an HMAC SHA-256 of
 * `userId.expiresAt`. The expiry is signed, so a copied cookie stops working after it even though only the browser
 * enforces `maxAge`.
 */
export function signSession(userId: string, secret: string, now: Date): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${hmac(payload, secret)}`;
}

/** The user id of a valid, unexpired value, or `null` for anything tampered, malformed or expired. */
export function verifySession(value: string, secret: string, now: Date): string | null {
  const signatureAt = value.lastIndexOf(".");
  if (signatureAt <= 0) return null;
  const payload = value.slice(0, signatureAt);
  const expiresAtAt = payload.lastIndexOf(".");
  if (expiresAtAt <= 0) return null;

  if (!sameSignature(value.slice(signatureAt + 1), hmac(payload, secret))) return null;

  const expiresAt = payload.slice(expiresAtAt + 1);
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) * 1000 <= now.getTime()) return null;
  return payload.slice(0, expiresAtAt);
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Constant time compare; a different length is already a mismatch and leaks only the length. */
function sameSignature(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
