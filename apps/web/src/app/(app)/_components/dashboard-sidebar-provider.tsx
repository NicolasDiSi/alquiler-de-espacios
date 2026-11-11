"use client";

// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/dashboard/_components/sidebar/dashboard-sidebar-provider.tsx.
import { type ComponentProps, useEffect, useState } from "react";

import { SidebarProvider } from "@/components/ui/sidebar";
import { getClientCookie } from "@/lib/cookie.client";

/** Written by `SidebarProvider` itself whenever the sidebar is toggled. */
const SIDEBAR_STATE_COOKIE = "sidebar_state";

/**
 * Restores the saved open state on the client, so the layout reads no cookies and every route prerenders.
 * Motion stays paused until the restored state has painted, so a saved collapsed sidebar does not animate in.
 */
export function DashboardSidebarProvider(props: Omit<ComponentProps<typeof SidebarProvider>, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(true);
  const [isMotionPaused, setIsMotionPaused] = useState(true);

  useEffect(() => {
    setOpen(getClientCookie(SIDEBAR_STATE_COOKIE) !== "false");

    // Two frames: the restored state paints without motion first, then motion resumes for the reader's own toggles.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setIsMotionPaused(false));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <SidebarProvider
      {...props}
      open={open}
      onOpenChange={setOpen}
      className={isMotionPaused ? "disable-transitions" : undefined}
    />
  );
}
