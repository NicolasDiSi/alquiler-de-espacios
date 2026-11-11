// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/lib/cookie.client.ts.
// The only file allowed to write document.cookie (biome.json override).

const ONE_YEAR_IN_DAYS = 365;

export function setClientCookie(key: string, value: string, days = ONE_YEAR_IN_DAYS) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${key}=${encodeURIComponent(value)}; expires=${expires}; path=/; samesite=lax`;
}

export function getClientCookie(key: string) {
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${key}=`))
    ?.split("=")[1];
  return raw === undefined ? undefined : decodeURIComponent(raw);
}
