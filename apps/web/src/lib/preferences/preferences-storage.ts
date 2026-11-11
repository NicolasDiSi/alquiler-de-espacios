"use client";

// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/lib/preferences/preferences-storage.ts. The server-cookie mode is not copied.
import { setClientCookie } from "../cookie.client";
import { setLocalStorageValue } from "../local-storage.client";
import { getPreferencePersistence, type PreferenceKey, type PreferenceValueMap } from "./preferences-config";

export function persistPreference<K extends PreferenceKey>(key: K, value: PreferenceValueMap[K]): void {
  switch (getPreferencePersistence(key)) {
    case "client-cookie":
      setClientCookie(key, value);
      return;
    case "localStorage":
      setLocalStorageValue(key, value);
      return;
    case "none":
      return;
  }
}
