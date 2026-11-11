"use client";

import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DENSITY_VALUES, type Density } from "@/lib/preferences/theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

function isDensity(value: string): value is Density {
  return (DENSITY_VALUES as readonly string[]).includes(value);
}

/** A segmented control for the per browser density. */
export function DensitySwitch({ className }: { className?: string }) {
  const t = useTranslations("shell.density");
  const { density, setPreference } = usePreferencesStore(
    useShallow((state) => ({ density: state.values.density, setPreference: state.setPreference })),
  );

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={density}
      onValueChange={(value) => {
        if (isDensity(value)) setPreference("density", value);
      }}
      aria-label={t("label")}
      className={className}
    >
      {DENSITY_VALUES.map((value) => (
        <ToggleGroupItem key={value} value={value}>
          {t(`options.${value}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
