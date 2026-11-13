import { defineConfig } from "vitest/config";

import { fileURLToPath } from "node:url";

export default defineConfig({
  // The app's `@/` imports (tsconfig `paths`), so a test can load a Route Handler as Next.js does.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    name: "web",
    include: ["src/**/*.test.ts"],
  },
});
