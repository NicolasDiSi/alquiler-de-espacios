// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/lib/preferences/preferences-config.ts.
// Spec 0002: theme_preset and font are removed, density is added, theme_mode defaults to system.

/**
 * How each preference is saved.
 *
 * "client-cookie" → a cookie written in the browser, read by the boot script before the first paint.
 * "localStorage"  → saved only on the client (not for anything that affects layout).
 * "none"          → not saved, resets on reload.
 */
import {
  CONTENT_LAYOUT_VALUES,
  NAVBAR_STYLE_VALUES,
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
} from "./layout";
import { DENSITY_VALUES, THEME_MODE_VALUES } from "./theme";

type PreferencePersistence = "none" | "client-cookie" | "localStorage";

type PreferenceDefinition<
  Values extends readonly string[],
  Persistence extends PreferencePersistence,
  Attribute extends `data-${string}`,
> = {
  values: Values;
  defaultValue: Values[number];
  persistence: Persistence;
  attribute: Attribute;
};

function definePreference<
  const Values extends readonly string[],
  const Persistence extends PreferencePersistence,
  const Attribute extends `data-${string}`,
>(definition: PreferenceDefinition<Values, Persistence, Attribute>) {
  return definition;
}

export const PREFERENCE_REGISTRY = {
  theme_mode: definePreference({
    values: THEME_MODE_VALUES,
    defaultValue: "system",
    persistence: "client-cookie",
    attribute: "data-theme-mode",
  }),

  density: definePreference({
    values: DENSITY_VALUES,
    defaultValue: "compact",
    persistence: "client-cookie",
    attribute: "data-density",
  }),

  content_layout: definePreference({
    values: CONTENT_LAYOUT_VALUES,
    defaultValue: "centered",
    persistence: "client-cookie",
    attribute: "data-content-layout",
  }),

  navbar_style: definePreference({
    values: NAVBAR_STYLE_VALUES,
    defaultValue: "sticky",
    persistence: "client-cookie",
    attribute: "data-navbar-style",
  }),

  sidebar_variant: definePreference({
    values: SIDEBAR_VARIANT_VALUES,
    defaultValue: "sidebar",
    persistence: "client-cookie",
    attribute: "data-sidebar-variant",
  }),

  sidebar_collapsible: definePreference({
    values: SIDEBAR_COLLAPSIBLE_VALUES,
    defaultValue: "icon",
    persistence: "client-cookie",
    attribute: "data-sidebar-collapsible",
  }),
} as const;

export type PreferenceKey = keyof typeof PREFERENCE_REGISTRY;

export type PreferenceValueMap = {
  [K in PreferenceKey]: (typeof PREFERENCE_REGISTRY)[K]["values"][number];
};

export const PREFERENCE_KEYS = Object.freeze(Object.keys(PREFERENCE_REGISTRY) as PreferenceKey[]);

export function getPreferencePersistence(key: PreferenceKey): PreferencePersistence {
  return PREFERENCE_REGISTRY[key].persistence;
}

export const PREFERENCE_DEFAULTS = Object.fromEntries(
  PREFERENCE_KEYS.map((key) => [key, PREFERENCE_REGISTRY[key].defaultValue]),
) as PreferenceValueMap;

export function parsePreference<K extends PreferenceKey>(
  key: K,
  rawValue: string | null | undefined,
): PreferenceValueMap[K] {
  const definition = PREFERENCE_REGISTRY[key];
  const allowedValues = definition.values as readonly string[];

  if (rawValue && allowedValues.includes(rawValue)) {
    return rawValue as PreferenceValueMap[K];
  }

  return definition.defaultValue as PreferenceValueMap[K];
}
