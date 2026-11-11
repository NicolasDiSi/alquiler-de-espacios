// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/lib/preferences/theme-utils.ts.
import type { ResolvedThemeMode, ThemeMode } from "./theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode === "system") return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
  return mode;
}

export function applyThemeMode(mode: ThemeMode): ResolvedThemeMode {
  const resolved = resolveThemeMode(mode);
  const doc = document.documentElement;
  doc.setAttribute("data-theme-mode", mode);
  doc.classList.add("disable-transitions");
  doc.classList.toggle("dark", resolved === "dark");
  doc.style.colorScheme = resolved;
  requestAnimationFrame(() => {
    doc.classList.remove("disable-transitions");
  });
  return resolved;
}

/** Calls `onChange` whenever the operating system switches between light and dark. */
export function subscribeToSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
