"use client";

// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/components/app-toaster.tsx.
import { useTranslations } from "next-intl";

import { Toaster } from "@/components/ui/sonner";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/**
 * The shadcn Toaster reads next-themes, which this app does not use, so toasts would follow the operating system
 * instead of the app's mode. This wrapper feeds it the resolved mode and colors each toast icon with its status token.
 */
export function AppToaster() {
  const t = useTranslations("common");
  const resolvedThemeMode = usePreferencesStore((state) => state.resolvedThemeMode);

  return (
    <Toaster
      theme={resolvedThemeMode}
      containerAriaLabel={t("notifications")}
      toastOptions={{
        closeButtonAriaLabel: t("close"),
        classNames: {
          toast: "cn-toast font-sans",
          title: "font-medium",
          success: "[&_[data-icon]]:text-success",
          info: "[&_[data-icon]]:text-info",
          warning: "[&_[data-icon]]:text-warning",
          error: "[&_[data-icon]]:text-destructive",
        },
      }}
    />
  );
}
