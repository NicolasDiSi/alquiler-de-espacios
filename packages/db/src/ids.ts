import type { IdGenerator } from "@espacios/application";

import { randomBytes } from "node:crypto";

/**
 * UUIDv7 (RFC 9562): 48 bits of unix milliseconds, then random bits, so ids sort by creation time. Node has no
 * built in v7 yet, and the format is small enough not to need a dependency.
 */
export function createUuidV7Generator(now: () => number = Date.now): IdGenerator {
  return {
    next: () => {
      const bytes = randomBytes(16);
      const time = BigInt(now());
      for (let index = 0; index < 6; index += 1) bytes[index] = Number((time >> BigInt(40 - 8 * index)) & 0xffn);
      bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
      bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
      const hex = bytes.toString("hex");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  };
}
