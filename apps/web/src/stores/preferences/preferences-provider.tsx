"use client";

// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/stores/preferences/preferences-provider.tsx.
import { createContext, type ReactNode, use, useEffect, useState } from "react";

import { type StoreApi, useStore } from "zustand";

import {
  PREFERENCE_DEFAULTS,
  PREFERENCE_KEYS,
  PREFERENCE_REGISTRY,
  type PreferenceKey,
  type PreferenceValueMap,
  parsePreference,
} from "@/lib/preferences/preferences-config";
import { applyThemeMode, subscribeToSystemTheme } from "@/lib/preferences/theme-utils";

import { createPreferencesStore, type PreferencesState } from "./preferences-store";

const PreferencesStoreContext = createContext<StoreApi<PreferencesState> | null>(null);

function readDomPreference<K extends PreferenceKey>(key: K): PreferenceValueMap[K] {
  const rawValue = document.documentElement.getAttribute(PREFERENCE_REGISTRY[key].attribute);
  return parsePreference(key, rawValue);
}

function readDomPreferences(): PreferenceValueMap {
  const values = { ...PREFERENCE_DEFAULTS };

  function assignPreference<K extends PreferenceKey>(key: K) {
    values[key] = readDomPreference(key);
  }

  for (const key of PREFERENCE_KEYS) assignPreference(key);
  return values;
}

export function PreferencesStoreProvider({
  children,
  initialValues,
}: {
  children: ReactNode;
  initialValues: PreferenceValueMap;
}) {
  const [store] = useState<StoreApi<PreferencesState>>(() => createPreferencesStore(initialValues));

  // The boot script already applied the stored preferences to <html>; the store adopts them after hydration.
  useEffect(() => {
    store.setState({
      values: readDomPreferences(),
      resolvedThemeMode: document.documentElement.classList.contains("dark") ? "dark" : "light",
    });
  }, [store]);

  // While the mode is "system", follow the operating system as it changes.
  useEffect(() => {
    let unsubscribeMedia: (() => void) | undefined;

    const subscribeForMode = (mode: PreferenceValueMap["theme_mode"]) => {
      unsubscribeMedia?.();
      unsubscribeMedia = undefined;

      if (mode === "system") {
        unsubscribeMedia = subscribeToSystemTheme(() => {
          store.setState({ resolvedThemeMode: applyThemeMode("system") });
        });
      }
    };

    subscribeForMode(store.getState().values.theme_mode);

    const unsubscribeStore = store.subscribe((state, previousState) => {
      if (state.values.theme_mode !== previousState.values.theme_mode) {
        subscribeForMode(state.values.theme_mode);
      }
    });

    return () => {
      unsubscribeMedia?.();
      unsubscribeStore();
    };
  }, [store]);

  return <PreferencesStoreContext value={store}>{children}</PreferencesStoreContext>;
}

export function usePreferencesStore<T>(selector: (state: PreferencesState) => T): T {
  const store = use(PreferencesStoreContext);
  if (!store) throw new Error("Missing PreferencesStoreProvider");
  return useStore(store, selector);
}
