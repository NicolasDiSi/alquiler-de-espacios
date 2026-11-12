"use client";

// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx.
import type { ReactNode } from "react";

import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";

import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/** The shell's sidebar. `brand` and `children` (the sections) come from server leaves that know the role. */
export function AppSidebar({ brand, children }: { readonly brand: ReactNode; readonly children?: ReactNode }) {
  const t = useTranslations("shell.sidebar");
  // Before the store syncs from the DOM it holds the registry defaults, which match the prerendered markup.
  const { variant, collapsible } = usePreferencesStore(
    useShallow((s) => ({ variant: s.values.sidebar_variant, collapsible: s.values.sidebar_collapsible })),
  );

  return (
    <Sidebar variant={variant} collapsible={collapsible} aria-label={t("label")}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>{brand}</SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>{children}</SidebarContent>
    </Sidebar>
  );
}
