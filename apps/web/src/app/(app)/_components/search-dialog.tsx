"use client";

// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/dashboard/_components/header/search-dialog.tsx.
// Searches the signed in role's sidebar sections only; no sub items or new tab links exist here yet.
import { Fragment, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { sidebarItems } from "@/navigation/sidebar-items";

/** `viewer` (the role) is null until the session is read (and without one): the button shows, the list stays empty. */
export function SearchDialog({ viewer }: { readonly viewer: "member" | "operator" | null }) {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const groups = sidebarItems.filter((group) => group.role === viewer);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "j" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = (url: string) => {
    setOpen(false);
    router.push(url);
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="link"
        className="text-muted-foreground px-0! font-normal hover:no-underline"
        aria-keyshortcuts="Control+J Meta+J"
      >
        <Search aria-hidden data-icon="inline-start" />
        {t("search.open")}
        {/* The shortcut is announced through aria-keyshortcuts, so the hint stays out of the button's name. */}
        <kbd
          aria-hidden
          className="bg-muted inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[10px] font-medium select-none"
        >
          {t("search.keys")}
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t("search.title")} description={t("search.description")}>
        <Command>
          <CommandInput placeholder={t("search.placeholder")} />
          <CommandList>
            <CommandEmpty>{t("search.empty")}</CommandEmpty>
            {groups.map((group, index) => (
              <Fragment key={group.id}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={t(`nav.${group.label ?? "navigation"}`)}>
                  {group.items.map((item) => (
                    <CommandItem key={item.id} value={t(`nav.${item.label}`)} onSelect={() => go(item.url)}>
                      <item.icon aria-hidden />
                      <span className="truncate">{t(`nav.${item.label}`)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
