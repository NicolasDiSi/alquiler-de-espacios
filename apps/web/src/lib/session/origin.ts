/**
 * CSRF guard for state changing Route Handlers (spec 0001, Security model). `SameSite=Lax` treats other localhost
 * ports as the same site, so the Origin header is the real check: refuse it when present and pointing at another
 * host, allow it when absent (curl and other non browser clients send none).
 */
export function isAllowedOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (origin === null) return true;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The documented API takes JSON bodies only, so a cross site HTML form cannot post to it. */
export function isJsonRequest(headers: Headers): boolean {
  const type = headers.get("content-type") ?? "";
  return type.split(";")[0]?.trim().toLowerCase() === "application/json";
}
