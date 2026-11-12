"use client";

import {
  createContext,
  type FormEvent,
  type ReactElement,
  type ReactNode,
  startTransition,
  use,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import Link from "next/link";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { OperatorFormState } from "@/lib/operator/form-action";

import { RefusalTable } from "./refusal-table";

type FieldMark = { "aria-invalid"?: true; "aria-describedby"?: string };

/** The marks of the fields a refusal names, for the fields inside a `FormDialog`. */
const FieldMarks = createContext<(field: string) => FieldMark>(() => ({}));

/** `aria-invalid` and a link to the alert when the last refusal named this field, nothing otherwise. */
export const useFieldMark = (field: string): FieldMark => use(FieldMarks)(field);

export type FormDialogProps = {
  readonly action: (previous: OperatorFormState, formData: FormData) => Promise<OperatorFormState>;
  /** The button that opens it, as rendered (a `Button`). None when the dialog is opened from outside (`open`). */
  readonly trigger?: ReactElement;
  /** Controlled from outside (a calendar selection opens it); otherwise the trigger opens it. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly submitVariant?: "default" | "destructive";
  /** The zone the times of a refusal's bookings are shown in (the sede's). */
  readonly timeZone: string;
  /** Posted with the form and never edited (the record's id, the sede's id). */
  readonly hidden?: Readonly<Record<string, string>>;
  /** The fields; each reads its marks with `useFieldMark`. */
  readonly children?: ReactNode;
};

/**
 * A dialog with one form and one Server Action (spec 0005). The body mounts only while it is open, so every opening
 * starts clean. A refusal keeps it open with the values typed, shows the reason in one focused alert, marks the fields
 * it names and lists the bookings in the way. A success closes it and shows a toast.
 */
export function FormDialog({ trigger, open: controlled, onOpenChange, ...props }: FormDialogProps) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const setOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setOwn(next));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <FormBody {...props} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** A `FormDialog` with no fields: the question, its consequence, and the button that does it. */
export function ConfirmDialog(props: Omit<FormDialogProps, "children">) {
  return <FormDialog {...props} />;
}

function FormBody({
  action,
  title,
  description,
  submitLabel,
  pendingLabel,
  submitVariant = "default",
  timeZone,
  hidden,
  children,
  onClose,
}: Omit<FormDialogProps, "trigger" | "open" | "onOpenChange"> & { readonly onClose: () => void }) {
  const t = useTranslations("operator.form");
  const common = useTranslations("common");
  const [state, formAction, pending] = useActionState<OperatorFormState, FormData>(action, null);
  const alertRef = useRef<HTMLDivElement>(null);
  const handled = useRef<OperatorFormState>(null);
  const [closing, setClosing] = useState(false);
  const errorId = useId();

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.result.ok) {
      setClosing(true);
      toast.success(state.result.message);
      onClose();
    } else {
      alertRef.current?.focus();
    }
  }, [state, onClose]);

  // Submitting inside a transition keeps React from resetting the form after the action, so a refusal loses nothing.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  const failure = state && !state.result.ok ? state.result : null;
  const invalid = new Set(state?.invalidFields ?? []);
  const mark = (field: string): FieldMark =>
    invalid.has(field) ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  return (
    <form action={formAction} onSubmit={submit} aria-busy={pending} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {failure ? (
        <Alert ref={alertRef} id={errorId} variant="destructive" tabIndex={-1} className="outline-none">
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{failure.message}</span>
            {failure.details ? <RefusalTable details={failure.details} timeZone={timeZone} /> : null}
            {failure.reason === "busy" ? (
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                {t("retry")}
              </Button>
            ) : null}
            {failure.reason === "unauthenticated" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/ingresar">{t("signInAgain")}</Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FieldMarks value={mark}>{children}</FieldMarks>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button type="submit" variant={submitVariant} disabled={pending || closing}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
