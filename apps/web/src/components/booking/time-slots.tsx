"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * The starts a day offers, as a vertical list of 44 pixel buttons in a scroll area (spec 0008): one choice, each with
 * its detail ("3 salas"). Only free starts are listed, so a taken time is never offered.
 */
export function TimeSlots({
  label,
  slots,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly slots: readonly { readonly value: string; readonly time: string; readonly detail?: string }[];
  readonly selected: string | null;
  readonly onSelect: (value: string) => void;
}) {
  return (
    <ScrollArea className="h-[22rem] pr-3">
      <ToggleGroup
        type="single"
        orientation="vertical"
        variant="outline"
        spacing={2}
        aria-label={label}
        value={selected ?? ""}
        onValueChange={(next) => (next ? onSelect(next) : null)}
        className="flex w-full flex-col"
      >
        {slots.map((slot) => (
          <ToggleGroupItem
            key={slot.value}
            value={slot.value}
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 w-full justify-between px-4 tabular-nums"
          >
            <span className="font-medium">{slot.time}</span>
            {slot.detail ? <span className="text-xs opacity-80">{slot.detail}</span> : null}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </ScrollArea>
  );
}
