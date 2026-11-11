import { signSession } from "../src/lib/session/token";

/** The key the e2e server signs with. Test only; the real one comes from `.env.local`. */
// biome-ignore lint/security/noSecrets: a fixed key for the throwaway e2e server, not a secret.
export const E2E_SESSION_SECRET = "e2e-only-session-secret-0123456789abcdef";
export const BASE_URL = "http://localhost:3100";

/** Seeded users (packages/db/prisma/seed.sql). */
export const USERS = {
  ana: { id: "user-acme-ana", name: "Ana (Acme)", company: "Acme SA" },
  carla: { id: "user-globex-carla", name: "Carla (Globex)", company: "Globex SRL" },
  operador: { id: "user-operador", name: "Operador" },
} as const;

/** The cookie the picker would set for this user, signed now with the e2e key. */
export function sessionCookie(userId: string, now = new Date()) {
  return { name: "espacios_session", value: signSession(userId, E2E_SESSION_SECRET, now), url: BASE_URL };
}

/** For `storageState` in the config: domain and path instead of a url. */
export function sessionCookieState(userId: string) {
  const { name, value } = sessionCookie(userId);
  return {
    name,
    value,
    domain: "localhost",
    path: "/",
    expires: -1,
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
  };
}
