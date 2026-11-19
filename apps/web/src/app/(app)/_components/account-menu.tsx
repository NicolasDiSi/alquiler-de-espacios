"use client";

// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/dashboard/_components/header/account-switcher.tsx.
// One signed in user: the menu shows who it is and leads back to the picker to switch.
import { useTransition } from "react";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { signOut } from "@/app/ingresar/_actions/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsOf } from "@/lib/operator/format";

export function AccountMenu({ name, detail }: { readonly name: string; readonly detail: string }) {
  const t = useTranslations("session");
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-lg p-0" aria-label={t("menu", { name })}>
          <Avatar className="size-8 rounded-lg after:rounded-lg">
            <AvatarFallback className="rounded-lg">{initialsOf(name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 rounded-lg" side="bottom" align="end" sideOffset={4}>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5">
            <Avatar className="size-9 rounded-lg after:rounded-lg">
              <AvatarFallback aria-hidden className="rounded-lg">
                {initialsOf(name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="sr-only">{t("label")}</span>
              <span className="text-foreground truncate font-semibold">{name}</span>
              <span className="text-muted-foreground truncate text-xs">{detail}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={() => startTransition(() => signOut())}>
          <LogOut aria-hidden />
          {t("switchUser")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
