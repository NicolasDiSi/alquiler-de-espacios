import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The repo keeps one `.env.local` at its root (see `.env.example`), shared with the database scripts. Next.js reads
// only this app's folder, so load the root file here. Variables already set (Playwright, CI) win.
const ROOT_ENV = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // `forbidden()` renders the 403 page when a member opens an operator page or the reverse (spec 0002).
  experimental: { authInterrupts: true },
};

export default withNextIntl(nextConfig);
