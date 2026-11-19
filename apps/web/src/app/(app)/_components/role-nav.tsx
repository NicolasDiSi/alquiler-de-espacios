"use client";

import { sidebarItems } from "@/navigation/sidebar-items";

import { NavMain } from "./nav-main";

/** The sidebar sections of one role. The icons stay on this side, so only the role crosses from the server. */
export function RoleNav({ role }: { readonly role: "member" | "operator" }) {
  return <NavMain groups={sidebarItems.filter((group) => group.role === role)} />;
}
