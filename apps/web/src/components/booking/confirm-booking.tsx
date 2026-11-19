"use client";

import { type FormEvent, startTransition, useActionState, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import type { AvailabilityRoom } from "@espacios/application";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ErrorDialog } from "@/components/error-dialog";
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
 * The confirmation itself: the chosen values as hidden fields and the button. A refusal opens its reason in an
 * `ErrorDialog` on top (no field here can hold it: the choice is made above), and closing it gives the focus back to
 * the button. A booking keeps the user on the screen: a toast confirms it (with a way to Mis reservas, where it is marked "Nueva")
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
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const handled = useRef<BookingFormState>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const failure = state && !state.result.ok ? state.result : null;

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (!state.result.ok) setErrorOpen(true);
  }, [state]);

  // Submitting inside a transition keeps React from resetting the form, so "Reintentar" sends the same choice.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  return (
    <form ref={formRef} action={formAction} onSubmit={submit} className="flex flex-col gap-3" aria-busy={pending}>
      <input type="hidden" name="roomId" value={choice.room.id} />
      <input type="hidden" name="date" value={choice.date} />
      <input type="hidden" name="start" value={choice.start} />
      <input type="hidden" name="end" value={choice.end} />
      {failure ? (
        <ErrorDialog
          open={errorOpen}
          onOpenChange={(next) => {
            setErrorOpen(next);
            if (!next) requestAnimationFrame(() => submitRef.current?.focus());
          }}
          message={failure.message}
          reason={failure.reason}
          onRetry={() => formRef.current?.requestSubmit()}
        />
      ) : null}
      <Button ref={submitRef} type="submit" size="lg" className="h-11" disabled={pending}>
        <Check aria-hidden />
        {pending ? t("confirming") : t("confirm")}
      </Button>
    </form>
  );
}
