"use client";

import type { ComponentProps } from "react";

import { useTranslations } from "next-intl";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

/**
 * The sidebar toggle with its translated label and open state. It reads the sidebar context, so it works anywhere
 * inside `DashboardSidebarProvider`: the header, a page toolbar, the sidebar itself.
 */
export function AppSidebarTrigger(props: ComponentProps<typeof SidebarTrigger>) {
  const t = useTranslations("shell.sidebar");
  const { open, openMobile, isMobile } = useSidebar();

  return <SidebarTrigger aria-label={t("toggle")} aria-expanded={isMobile ? openMobile : open} {...props} />;
}
