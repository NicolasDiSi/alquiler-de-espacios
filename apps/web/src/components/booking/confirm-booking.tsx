"use client";

import { useActionState } from "react";

import { useRouter } from "next/navigation";

import type { AvailabilityRoom } from "@espacios/application";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
