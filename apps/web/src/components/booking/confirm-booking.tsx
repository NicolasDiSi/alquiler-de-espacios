"use client";

import { useActionState } from "react";

import { useRouter } from "next/navigation";

import type { AvailabilityRoom } from "@espacios/application";
import { Check } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { type BookingFormState, bookRoom } from "@/lib/bookings/book-room-action";

export type BookingChoice = {
  readonly room: AvailabilityRoom;
  /** `YYYY-MM-DD` and `HH:MM` in the room's sede zone. */
  readonly date: string;
  readonly start: string;
  readonly end: string;
};

/**
 * The confirmation itself: the chosen values as hidden fields and the refusal, with its reason, above the button. A
 * booking keeps the user on the screen: a toast confirms it (with a way to Mis reservas, where it is marked "Nueva")
 * and `onBooked` lets the screen clear its choice, so the next booking starts at once.
 */
export function ConfirmForm({ choice, onBooked }: { readonly choice: BookingChoice; readonly onBooked?: () => void }) {
  const t = useTranslations("booking.confirm");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<BookingFormState, FormData>(async (previous, formData) => {
    const next = await bookRoom(previous, formData);
    if (next && "bookingId" in next) {
      const href = `/?vista=proximas&nueva=${encodeURIComponent(next.bookingId)}`;
      toast.success(next.result.message, { action: { label: t("seeBookings"), onClick: () => router.push(href) } });
      onBooked?.();
    }
    return next;
  }, null);
  return (
    <form action={formAction} className="flex flex-col gap-3" aria-busy={pending}>
      <input type="hidden" name="roomId" value={choice.room.id} />
      <input type="hidden" name="date" value={choice.date} />
      <input type="hidden" name="start" value={choice.start} />
      <input type="hidden" name="end" value={choice.end} />
      {state && !state.result.ok ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.result.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        <Check aria-hidden />
        {pending ? t("confirming") : t("confirm")}
      </Button>
    </form>
  );
}

/**
 * The chosen room and time, confirmed through `bookRoom` (spec 0003), so every refusal keeps its reason (spec 0008).
 * A card beside the search from `lg`; below it, a bar fixed at the bottom that opens a drawer, so confirming never
 * needs a scroll to the end of the page.
 */
export function ConfirmBooking({ choice, empty }: { readonly choice: BookingChoice | null; readonly empty: string }) {
  const t = useTranslations("booking.confirm");
  const format = useFormatter();
  const day = choice
    ? format.dateTime(new Date(`${choice.date}T12:00:00Z`), {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      })
    : "";
  const what = choice ? t("what", { day, start: choice.start, end: choice.end }) : "";
  const where = choice
    ? t("where", { room: choice.room.name, facility: choice.room.facility.name, capacity: choice.room.capacity })
    : "";

  return (
    <>
      <Card className="hidden lg:flex">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{choice ? t("instant") : empty}</CardDescription>
        </CardHeader>
        {choice ? (
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold first-letter:uppercase">{what}</p>
              <p className="text-muted-foreground text-sm">{where}</p>
            </div>
            <ConfirmForm choice={choice} />
          </CardContent>
        ) : null}
      </Card>

      {choice ? (
        <div className="bg-card fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t p-3 shadow-lg lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium first-letter:uppercase">{what}</p>
            <p className="text-muted-foreground truncate text-xs">{choice.room.name}</p>
          </div>
          <Drawer>
            <DrawerTrigger asChild>
              <Button className="h-11">{t("review")}</Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle className="first-letter:uppercase">{what}</DrawerTitle>
                <DrawerDescription>{where}</DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <ConfirmForm choice={choice} />
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      ) : null}
    </>
  );
}
