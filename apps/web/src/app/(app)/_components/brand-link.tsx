"use client";

import Link from "next/link";

import { LifeBuoy } from "lucide-react";
import { useTranslations } from "next-intl";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";

/** The product name at the top of the sidebar, linking to the signed in role's home. */
export function BrandLink({ href }: { readonly href: string }) {
  const t = useTranslations("shell.sidebar");
  return (
    <SidebarMenuButton asChild size="lg" tooltip={APP_CONFIG.name}>
      <Link prefetch={false} href={href} aria-label={t("home")}>
        <span className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
          <LifeBuoy aria-hidden className="size-4" />
        </span>
        <span className="truncate text-base font-semibold">{APP_CONFIG.name}</span>
      </Link>
    </SidebarMenuButton>
  );
}
