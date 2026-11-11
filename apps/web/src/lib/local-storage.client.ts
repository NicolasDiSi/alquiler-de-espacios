"use client";

// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/lib/local-storage.client.ts.

export function setLocalStorageValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[localStorage] Failed to write value:", error);
    }
  }
}
