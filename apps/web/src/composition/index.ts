// The composition root: the only place in the app that creates adapters (dependency cruiser rule
// `only-composition-root-wires-adapters`). Everything is created on first use, so `next build` needs no database.
import type { RoomCatalog, UserDirectory } from "@espacios/application";
import {
  createDatabaseClient,
  createPrismaRoomCatalog,
  createPrismaUserDirectory,
  type DatabaseClient,
} from "@espacios/db";

import { MIN_SECRET_BYTES } from "@/lib/session/token";

/** One client per process, kept across dev hot reloads so they do not open a new pool each time. */
const cache = globalThis as typeof globalThis & { __espaciosRuntimeDb?: DatabaseClient };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local at the repo root and fill it in.`);
  }
  return value;
}

/** The company edge login (`espacios_app`): row level security applies. */
function runtimeDb(): DatabaseClient {
  cache.__espaciosRuntimeDb ??= createDatabaseClient(requireEnv("DATABASE_URL"));
  return cache.__espaciosRuntimeDb;
}

export function userDirectory(): UserDirectory {
  return createPrismaUserDirectory(runtimeDb());
}

export function roomCatalog(): RoomCatalog {
  return createPrismaRoomCatalog(runtimeDb());
}

/** The HMAC key for the session cookie. A short key is refused rather than used. */
export function sessionSecret(): string {
  const secret = requireEnv("SESSION_SECRET");
  // The `.env.example` placeholder is long enough but public, so it is refused too.
  if (Buffer.byteLength(secret) < MIN_SECRET_BYTES || secret.startsWith("replace-with")) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SECRET_BYTES} bytes. Generate one with: openssl rand -hex 32`,
    );
  }
  return secret;
}
