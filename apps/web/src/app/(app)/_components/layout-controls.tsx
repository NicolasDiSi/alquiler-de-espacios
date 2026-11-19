"use client";

// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/dashboard/_components/header/layout-controls.tsx.
// Spec 0002: no preset or font picker. Mode has its own switch in the header; density (compact or comfortable) lives here.
import { useId } from "react";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CONTENT_LAYOUT_VALUES,
  NAVBAR_STYLE_VALUES,
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
} from "@/lib/preferences/layout";
import { type PreferenceValueMap, parsePreference } from "@/lib/preferences/preferences-config";
import { DENSITY_VALUES } from "@/lib/preferences/theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

type LayoutKey = "content_layout" | "navbar_style" | "sidebar_variant" | "sidebar_collapsible";

const LAYOUT_OPTIONS = {
  content_layout: CONTENT_LAYOUT_VALUES,
  navbar_style: NAVBAR_STYLE_VALUES,
  sidebar_variant: SIDEBAR_VARIANT_VALUES,
  sidebar_collapsible: SIDEBAR_COLLAPSIBLE_VALUES,
} as const satisfies { [K in LayoutKey]: readonly PreferenceValueMap[K][] };

const LAYOUT_KEYS = Object.keys(LAYOUT_OPTIONS) as LayoutKey[];

export function LayoutControls() {
  const t = useTranslations("shell.layout");
  const tDensity = useTranslations("shell.density");
  const idPrefix = useId();
  const { values, setPreference, resetPreferences } = usePreferencesStore(
    useShallow((state) => ({
      values: state.values,
      setPreference: state.setPreference,
      resetPreferences: state.resetPreferences,
    })),
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" aria-label={t("open")}>
          <Settings aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <h2 className="text-sm leading-none font-medium">{t("title")}</h2>
            <p className="text-muted-foreground text-xs">{t("description")}</p>
          </div>
          <div className="space-y-1.5">
            <p id={`${idPrefix}-density`} className="text-xs font-medium">
              {tDensity("label")}
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              className="w-full"
              aria-labelledby={`${idPrefix}-density`}
              value={values.density}
              onValueChange={(value) => {
                if (value) setPreference("density", parsePreference("density", value));
              }}
            >
              {DENSITY_VALUES.map((option) => (
                <ToggleGroupItem key={option} value={option} className="flex-1 text-xs">
                  {tDensity(`options.${option}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {LAYOUT_KEYS.map((key) => (
            <div key={key} className="space-y-1.5">
              <p id={`${idPrefix}-${key}`} className="text-xs font-medium">
                {t(`${key}.label`)}
              </p>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                className="w-full"
                aria-labelledby={`${idPrefix}-${key}`}
                value={values[key]}
                onValueChange={(value) => {
                  if (value) setPreference(key, parsePreference(key, value));
                }}
              >
                {LAYOUT_OPTIONS[key].map((option) => (
                  <ToggleGroupItem key={option} value={option} className="flex-1 text-xs">
                    {t(`${key}.options.${option}` as Parameters<typeof t>[0])}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={resetPreferences}>
            {t("reset")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
