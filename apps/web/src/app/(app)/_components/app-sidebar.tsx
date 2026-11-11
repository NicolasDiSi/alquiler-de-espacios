"use client";

// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx.
import Link from "next/link";

import { LifeBuoy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { sidebarItems } from "@/navigation/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";

export function AppSidebar() {
  const t = useTranslations("shell.sidebar");
  // Before the store syncs from the DOM it holds the registry defaults, which match the prerendered markup.
  const { variant, collapsible } = usePreferencesStore(
    useShallow((s) => ({ variant: s.values.sidebar_variant, collapsible: s.values.sidebar_collapsible })),
  );

  return (
    <Sidebar variant={variant} collapsible={collapsible} aria-label={t("label")}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={APP_CONFIG.name}>
              <Link prefetch={false} href="/" aria-label={t("home")}>
                <span className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                  <LifeBuoy aria-hidden className="size-4" />
                </span>
                <span className="truncate text-base font-semibold">{APP_CONFIG.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={sidebarItems} />
      </SidebarContent>
    </Sidebar>
  );
}
