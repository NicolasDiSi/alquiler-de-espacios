// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/layout.tsx.
import type { ReactNode } from "react";

import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AppToaster } from "@/components/app-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { LOCALE } from "@/i18n/config";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: APP_CONFIG.name, template: `%s · ${APP_CONFIG.name}` },
    description: t("description"),
  };
}

// Reads no cookies or headers, so every route prerenders. The server renders the defaults (light, compact) and the
// boot script swaps in the stored or system values before the first paint.
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { theme_mode, density, content_layout, navbar_style, sidebar_variant, sidebar_collapsible } =
    PREFERENCE_DEFAULTS;
  return (
    <html
      lang={LOCALE}
      data-theme-mode={theme_mode}
      data-density={density}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <head>
        <ThemeBootScript />
      </head>
      <body className="min-h-screen">
        <NextIntlClientProvider>
          <TooltipProvider>
            <PreferencesStoreProvider initialValues={PREFERENCE_DEFAULTS}>
              {children}
              <AppToaster />
            </PreferencesStoreProvider>
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
