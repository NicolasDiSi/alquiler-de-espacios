// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/lib/preferences/theme.ts. Presets removed.

export const THEME_MODE_VALUES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODE_VALUES)[number];
export type ResolvedThemeMode = "light" | "dark";

/** Density changes only Tailwind's spacing unit (see `globals.css`). */
export const DENSITY_VALUES = ["compact", "comfortable"] as const;
export type Density = (typeof DENSITY_VALUES)[number];
