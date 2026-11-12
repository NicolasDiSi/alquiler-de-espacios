"use client";

import { useState, useTransition } from "react";

import type { BookingView } from "@espacios/application";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { cancelBooking } from "../_actions/cancel-booking";

export type CancelBookingButtonProps = {
  readonly booking: BookingView;
  /** What the dialog and the button's name say about the booking, already formatted. */
  readonly summary: { readonly room: string; readonly date: string; readonly time: string };
  /** The booking is no longer upcoming (cancelled now, or already cancelled): the list drops the row. */
  readonly onGone: (id: string) => void;
};

/**
 * The cancel action of a row in Próximas (spec 0003, feature 7). Cancelling is final, so it asks first. The company is
 * never sent: the action reads it from the session. A refusal keeps the dialog open and says why; "ya estaba
 * cancelada" and "no encontrada" also drop the row, because it is not upcoming any more.
 */
export function CancelBookingButton({ booking, summary, onGone }: CancelBookingButtonProps) {
  const t = useTranslations("home.cancelAction");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  const confirm = () => {
    setFailure(null);
    startTransition(async () => {
      const result = await cancelBooking(booking.id);
      if (result.ok) {
        setOpen(false);
        onGone(booking.id);
        toast.success(result.message);
        return;
      }
      setFailure(result.message);
      if (result.reason === "already_cancelled" || result.reason === "not_found") onGone(booking.id);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A cancel in flight cannot be dismissed: the answer has to be seen.
        if (pending) return;
        setOpen(next);
        if (!next) setFailure(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={t("buttonFor", summary)}>
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", summary)}</DialogDescription>
        </DialogHeader>
        {failure ? (
          <p role="alert" className="text-destructive text-sm">
            {failure}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              {t("keep")}
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? t("pending") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
