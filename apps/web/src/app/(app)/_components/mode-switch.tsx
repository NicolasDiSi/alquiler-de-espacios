"use client";

// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/dashboard/_components/header/theme-switcher.tsx.
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { THEME_MODE_VALUES } from "@/lib/preferences/theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/** Cycles light → dark → system. The icon shows the current mode before React hydrates. */
export function ModeSwitch({ className }: { className?: string }) {
  const t = useTranslations("shell.mode");
  const { themeMode, setPreference } = usePreferencesStore(
    useShallow((state) => ({ themeMode: state.values.theme_mode, setPreference: state.setPreference })),
  );

  const cycleMode = () => {
    const next = THEME_MODE_VALUES[(THEME_MODE_VALUES.indexOf(themeMode) + 1) % THEME_MODE_VALUES.length];
    if (next) setPreference("theme_mode", next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={cycleMode}
      aria-label={t("cycle", { mode: t(`options.${themeMode}`) })}
    >
      <Monitor aria-hidden className="hidden [html[data-theme-mode=system]_&]:block" />
      <Moon aria-hidden className="hidden dark:block [html[data-theme-mode=system]_&]:hidden" />
      <Sun aria-hidden className="block dark:hidden [html[data-theme-mode=system]_&]:hidden" />
    </Button>
  );
}
