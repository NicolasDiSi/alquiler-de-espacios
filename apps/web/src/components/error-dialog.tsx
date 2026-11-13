"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import type { Reason } from "@espacios/domain";
import { useTranslations } from "next-intl";

import {
  AdaptiveAlertDialog,
  AdaptiveAlertDialogCancel,
  AdaptiveAlertDialogContent,
  AdaptiveAlertDialogDescription,
  AdaptiveAlertDialogFooter,
  AdaptiveAlertDialogHeader,
  AdaptiveAlertDialogTitle,
} from "@/components/adaptive-alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * A refusal no field can hold, in an adaptive alert dialog on top of the form that was refused: the form keeps what
 * was typed underneath, and this says why and offers the way forward the reason has (send it again when the server
 * was busy, pick a user again when the session ended). It has to be answered (an alert dialog never closes on a click
 * outside), takes the focus and is read out, so nothing of the form's space goes to it. The header and footer stay
 * put and only `children` (an `AdaptiveAlertDialogBody`, such as the bookings in the way) scrolls.
 */
export function ErrorDialog({
  open,
  onOpenChange,
  message,
  reason,
  onRetry,
  title,
  closeLabel,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The reason, in the catalog's words. */
  readonly message: string;
  /** The refusal's code, for its way forward. */
  readonly reason?: Reason;
  /** Sends the form again; offered when the refusal may pass on a second try (`busy`). */
  readonly onRetry?: () => void;
  /** "No se pudo completar" unless the refusal has a more precise one. */
  readonly title?: string;
  /** "Entendido" unless the answer says where it goes. */
  readonly closeLabel?: string;
  readonly children?: ReactNode;
}) {
  const t = useTranslations("formError");

  return (
    <AdaptiveAlertDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveAlertDialogContent className="md:max-w-lg" data-testid="error-dialog">
        <AdaptiveAlertDialogHeader>
          <AdaptiveAlertDialogTitle>{title ?? t("title")}</AdaptiveAlertDialogTitle>
          <AdaptiveAlertDialogDescription>{message}</AdaptiveAlertDialogDescription>
        </AdaptiveAlertDialogHeader>

        {children}

        <AdaptiveAlertDialogFooter>
          {reason === "unauthenticated" ? (
            <Button asChild variant="outline">
              <Link href="/ingresar">{t("signInAgain")}</Link>
            </Button>
          ) : null}
          {reason === "busy" && onRetry ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onRetry();
              }}
            >
              {t("retry")}
            </Button>
          ) : null}
          <AdaptiveAlertDialogCancel variant="default">{closeLabel ?? t("understood")}</AdaptiveAlertDialogCancel>
        </AdaptiveAlertDialogFooter>
      </AdaptiveAlertDialogContent>
    </AdaptiveAlertDialog>
  );
}
