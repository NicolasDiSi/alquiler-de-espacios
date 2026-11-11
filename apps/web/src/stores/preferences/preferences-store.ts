// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/stores/preferences/preferences-store.ts.
import { createStore } from "zustand/vanilla";

import { applyPreference } from "@/lib/preferences/preference-runtime";
import {
  PREFERENCE_DEFAULTS,
  PREFERENCE_KEYS,
  type PreferenceKey,
  type PreferenceValueMap,
} from "@/lib/preferences/preferences-config";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import type { ResolvedThemeMode } from "@/lib/preferences/theme";

export type PreferencesState = {
  values: PreferenceValueMap;
  resolvedThemeMode: ResolvedThemeMode;
  setPreference: <K extends PreferenceKey>(key: K, value: PreferenceValueMap[K]) => void;
  resetPreferences: () => void;
};

export const createPreferencesStore = (initialValues: PreferenceValueMap) =>
  createStore<PreferencesState>()((set) => ({
    values: initialValues,
    // The server always renders light; the provider reads the mode the boot script resolved.
    resolvedThemeMode: initialValues.theme_mode === "dark" ? "dark" : "light",

    setPreference: (key, value) => {
      const resolvedThemeMode = applyPreference(key, value);

      set((state) => ({
        values: { ...state.values, [key]: value },
        ...(resolvedThemeMode ? { resolvedThemeMode } : {}),
      }));

      persistPreference(key, value);
    },

    resetPreferences: () => {
      let resolvedThemeMode: ResolvedThemeMode = "light";

      for (const key of PREFERENCE_KEYS) {
        const value = PREFERENCE_DEFAULTS[key];
        const resolved = applyPreference(key, value);

        if (resolved) resolvedThemeMode = resolved;
        persistPreference(key, value);
      }

      set({ values: { ...PREFERENCE_DEFAULTS }, resolvedThemeMode });
    },
  }));
