// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/navigation/sidebar/sidebar-items.ts.
import type { LucideIcon } from "lucide-react";
import type { Messages } from "next-intl";

/** A key under `shell.nav` in the catalog. */
type NavLabelKey = keyof Messages["shell"]["nav"];

interface NavItem {
  id: string;
  label: NavLabelKey;
  url: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  label?: NavLabelKey;
  items: NavItem[];
}

/** Only sections that exist. Empty until the first section ships. */
export const sidebarItems: NavGroup[] = [];
