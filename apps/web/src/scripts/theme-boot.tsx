// Copied from Studio Admin (nextjs-templates, develop f19e0ef), src/scripts/theme-boot.tsx.
// The only file allowed an inline script (biome.json override).

/**
 * Reads the stored preferences before the first paint and applies them to <html>, so a page never renders in the
 * wrong mode or density first and the root layout stays static. A missing or "system" mode resolves from the
 * operating system; the preferences provider then follows operating system changes while the page is open.
 */
import { PREFERENCE_REGISTRY } from "@/lib/preferences/preferences-config";

export function ThemeBootScript() {
  const registry = JSON.stringify(PREFERENCE_REGISTRY);

  const code = `
    (function () {
      try {
        var root = document.documentElement;
        var REGISTRY = ${registry};

        function readCookie(name) {
          var match = document.cookie.split("; ").find(function (c) {
            return c.startsWith(name + "=");
          });
          return match ? decodeURIComponent(match.split("=")[1]) : null;
        }

        function readLocal(name) {
          try {
            return window.localStorage.getItem(name);
          } catch (e) {
            return null;
          }
        }

        function readPreference(key, definition) {
          var value = null;
          if (definition.persistence === "localStorage") value = readLocal(key);
          if (definition.persistence === "client-cookie") value = readCookie(key);
          return definition.values.indexOf(value) >= 0 ? value : definition.defaultValue;
        }

        var preferences = {};
        Object.keys(REGISTRY).forEach(function (key) {
          var definition = REGISTRY[key];
          var value = readPreference(key, definition);
          preferences[key] = value;
          root.setAttribute(definition.attribute, value);
        });

        var mode = preferences.theme_mode;
        var resolvedMode =
          mode === "system"
            ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
            : mode;

        root.classList.toggle("dark", resolvedMode === "dark");
        root.style.colorScheme = resolvedMode;
      } catch (e) {
        console.warn("ThemeBootScript error:", e);
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
