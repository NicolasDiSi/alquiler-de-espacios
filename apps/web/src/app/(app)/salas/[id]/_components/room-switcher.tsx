"use client";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** "Cambiar de sala": every bookable room, each opening its own calendar. */
export function RoomSwitcher({
  current,
  rooms,
}: {
  readonly current: string;
  readonly rooms: readonly { readonly id: string; readonly name: string; readonly capacity: number }[];
}) {
  const t = useTranslations("rooms.detail");
  const router = useRouter();
  return (
    <Select value={current} onValueChange={(id) => router.push(`/salas/${id}`)}>
      <SelectTrigger className="w-full sm:w-64 data-[size=default]:h-11" aria-label={t("switch")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {rooms.map((room) => (
            <SelectItem key={room.id} value={room.id}>
              {t("option", { name: room.name, capacity: room.capacity })}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
