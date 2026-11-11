"use client";

// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/dashboard/_components/sidebar/nav-main.tsx.
// Links only for now; groups with sub items come back when a feature needs them.
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslations } from "next-intl";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { NavGroup } from "@/navigation/sidebar-items";

export function NavMain({ groups }: { readonly groups: readonly NavGroup[] }) {
  const t = useTranslations("shell.nav");
  const path = usePathname();
  // Nested routes (e.g. /reservas/RES-12) keep their parent item active.
  const isActive = (url: string) => path === url || path.startsWith(`${url}/`);

  return groups.map((group) => (
    <SidebarGroup key={group.id}>
      {group.label && <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton asChild tooltip={t(item.label)} isActive={isActive(item.url)}>
                <Link prefetch={false} href={item.url} aria-current={isActive(item.url) ? "page" : undefined}>
                  <item.icon aria-hidden />
                  <span>{t(item.label)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
