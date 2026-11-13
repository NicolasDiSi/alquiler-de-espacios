// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/dashboard/layout.tsx.
import { type ReactNode, Suspense } from "react";

import { cn } from "cn";
import { useTranslations } from "next-intl";

import { Separator } from "@/components/ui/separator";
import { SidebarInset } from "@/components/ui/sidebar";

import { AppSidebar } from "./_components/app-sidebar";
import { AppSidebarTrigger } from "./_components/app-sidebar-trigger";
import { BrandLink } from "./_components/brand-link";
import { CurrentBrand, CurrentNav } from "./_components/current-nav";
import { CurrentSearch, CurrentUser } from "./_components/current-user";
import { DashboardSidebarProvider } from "./_components/dashboard-sidebar-provider";
import { LayoutControls } from "./_components/layout-controls";
import { ModeSwitch } from "./_components/mode-switch";
import { SearchDialog } from "./_components/search-dialog";

const MAIN_ID = "contenido";

// The layout reads no cookies itself: each page checks its own edge (requireMember, requireOperator), and only the
// CurrentSearch and CurrentUser leaves read the session, each inside its own Suspense boundary. Preferences are restored on the client.
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const t = useTranslations("shell");

  return (
    <DashboardSidebarProvider>
      <a
        href={`#${MAIN_ID}`}
        className="bg-primary text-primary-foreground focus-visible:outline-ring sr-only z-60 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t("skipToContent")}
      </a>
      <AppSidebar
        brand={
          <Suspense fallback={<BrandLink href="/" />}>
            <CurrentBrand />
          </Suspense>
        }
      >
        <Suspense fallback={null}>
          <CurrentNav />
        </Suspense>
      </AppSidebar>
      <SidebarInset
        id={MAIN_ID}
        tabIndex={-1}
        className={cn(
          "min-w-0 overflow-x-clip outline-none",
          "peer-data-[variant=inset]:border",
          "[html[data-content-layout=centered]_&>*]:mx-auto [html[data-content-layout=centered]_&>*]:w-full [html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
        )}
      >
        <header
          className={cn(
            "bg-card flex h-12 shrink-0 items-center border-b",
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:rounded-t-[inherit]",
          )}
        >
          <div className="flex w-full items-center justify-between gap-2 px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <AppSidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              <Suspense fallback={<SearchDialog viewer={null} />}>
                <CurrentSearch />
              </Suspense>
            </div>
            <div className="flex items-center gap-2">
              <LayoutControls />
              <ModeSwitch />
              <Suspense fallback={null}>
                <CurrentUser />
              </Suspense>
            </div>
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </DashboardSidebarProvider>
  );
}
