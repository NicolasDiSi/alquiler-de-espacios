"use client";

import { EllipsisVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parsePreference } from "@/lib/preferences/preferences-config";
import { DENSITY_VALUES, THEME_MODE_VALUES } from "@/lib/preferences/theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/** On small screens the mode and density switches move into this menu. */
export function HeaderOverflowMenu({ className }: { className?: string }) {
  const t = useTranslations("shell");
  const { themeMode, density, setPreference } = usePreferencesStore(
    useShallow((state) => ({
      themeMode: state.values.theme_mode,
      density: state.values.density,
      setPreference: state.setPreference,
    })),
  );

  return (
    // Not modal: a modal menu hides the page with aria-hidden while its controls stay focusable.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label={t("header.moreOptions")}>
          <EllipsisVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("mode.label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={themeMode}
            onValueChange={(value) => setPreference("theme_mode", parsePreference("theme_mode", value))}
          >
            {THEME_MODE_VALUES.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {t(`mode.options.${value}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("density.label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={density}
            onValueChange={(value) => setPreference("density", parsePreference("density", value))}
          >
            {DENSITY_VALUES.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {t(`density.options.${value}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
