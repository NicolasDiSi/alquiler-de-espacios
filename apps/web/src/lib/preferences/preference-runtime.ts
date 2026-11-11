"use client";

// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/lib/preferences/preference-runtime.ts.
import { PREFERENCE_REGISTRY, type PreferenceKey, type PreferenceValueMap } from "./preferences-config";
import type { ResolvedThemeMode } from "./theme";
import { applyThemeMode } from "./theme-utils";

export function applyPreference<K extends PreferenceKey>(
  key: K,
  value: PreferenceValueMap[K],
): ResolvedThemeMode | undefined {
  if (key === "theme_mode") {
    return applyThemeMode(value as PreferenceValueMap["theme_mode"]);
  }

  document.documentElement.setAttribute(PREFERENCE_REGISTRY[key].attribute, value);
  return undefined;
}
