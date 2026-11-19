// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/navigation/sidebar/sidebar-items.ts.
import {
  Building2,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChartColumn,
  DoorOpen,
  type LucideIcon,
  Users,
} from "lucide-react";
import type { Messages } from "next-intl";

/** A key under `shell.nav` in the catalog. */
type NavLabelKey = keyof Messages["shell"]["nav"];

interface NavItem {
  id: string;
  label: NavLabelKey;
  url: string;
  icon: LucideIcon;
  /** `exact`: active only on its own URL (a home, whose URL prefixes others); `section` also under it. */
  match: "exact" | "section";
}

export interface NavGroup {
  id: string;
  /** Who sees the group: the sidebar shows only the signed in role's groups. */
  role: "member" | "operator";
  label?: NavLabelKey;
  items: NavItem[];
}

/** Only sections that exist. Each role starts with its home (spec 0002: `/` for a member, `/operador` for the operator). */
export const sidebarItems: NavGroup[] = [
  {
    id: "member-bookings",
    role: "member",
    items: [
      { id: "my-bookings", label: "myBookings", url: "/", icon: CalendarDays, match: "exact" },
      { id: "new-booking", label: "newBooking", url: "/reservas/nueva", icon: CalendarPlus, match: "section" },
      { id: "rooms", label: "rooms", url: "/salas", icon: DoorOpen, match: "section" },
    ],
  },
  {
    id: "operator-home",
    role: "operator",
    items: [
      { id: "panel", label: "panel", url: "/operador", icon: ChartColumn, match: "exact" },
      { id: "reservas", label: "reservas", url: "/operador/reservas", icon: CalendarRange, match: "section" },
    ],
  },
  {
    id: "operator-admin",
    role: "operator",
    label: "admin",
    items: [
      { id: "sedes", label: "sedes", url: "/operador/sedes", icon: Building2, match: "section" },
      { id: "clientes", label: "clientes", url: "/operador/clientes", icon: Users, match: "section" },
    ],
  },
];
