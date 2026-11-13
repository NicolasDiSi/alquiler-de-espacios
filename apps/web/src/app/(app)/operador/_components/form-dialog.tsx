"use client";

import {
  createContext,
  type FormEvent,
  type ReactElement,
  type ReactNode,
  startTransition,
  use,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

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

import { FormErrorDialog } from "./form-error-dialog";

type FieldMark = { "aria-invalid"?: true; "aria-describedby"?: string };

/** The refusal's reason, shown under the field it names; `id` is what the field's `aria-describedby` points to. */
export type FieldError = { readonly id: string; readonly message: string };

type FieldErrors = {
  readonly mark: (field: string) => FieldMark;
  readonly error: (field: string) => FieldError | null;
  /** A field that shows its own refusals says so while it is mounted; the cleanup takes it back. */
  readonly register: (field: string) => () => void;
};

const FOCUSABLE = "input:not([type=hidden]), select, textarea, button";

const FieldErrors = createContext<FieldErrors>({
  mark: () => ({}),
  error: () => null,
  register: () => () => undefined,
});

/**
 * The marks of a field that shows its own refusal: spread `mark` on the control and render `error` under it
 * (`FieldErrorText`). The first field a refusal names that uses this hook holds the reason; the others it names are
 * only marked. A refusal that names no such field opens the error dialog instead.
 */
export function useFieldError(field: string): { readonly mark: FieldMark; readonly error: FieldError | null } {
  const { mark, error, register } = use(FieldErrors);
  useEffect(() => register(field), [register, field]);
  return { mark: mark(field), error: error(field) };
}

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
  /** The fields; each reads its marks and its reason with `useFieldError`. */
  readonly children?: ReactNode;
};

/**
 * A dialog with one form and one Server Action (spec 0005). The body mounts only while it is open, so every opening
 * starts clean. It is never taller than the screen: the header and the buttons stay put and only the fields scroll.
 *
 * A refusal keeps it open with the values typed, and says why in one of two places. When it names a field that shows
 * its own refusals, the reason goes under that field, which scrolls into view and takes the focus. Anything else (no
 * field named, bookings in the way, a session that ended) opens a `FormErrorDialog` on top, which has to be answered
 * and gives the focus back to the submit button. A success closes it and shows a toast.
 */
export function FormDialog({ trigger, open: controlled, onOpenChange, ...props }: FormDialogProps) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const setOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setOwn(next));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden">
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
  const common = useTranslations("common");
  const [state, formAction, pending] = useActionState<OperatorFormState, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const handled = useRef<OperatorFormState>(null);
  const [closing, setClosing] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [registered, setRegistered] = useState<ReadonlySet<string>>(() => new Set());
  const errorId = useId();

  const register = useCallback((field: string) => {
    setRegistered((current) => (current.has(field) ? current : new Set(current).add(field)));
    return () =>
      setRegistered((current) => {
        if (!current.has(field)) return current;
        const next = new Set(current);
        next.delete(field);
        return next;
      });
  }, []);

  const failure = state && !state.result.ok ? state.result : null;
  const invalid = state?.invalidFields ?? [];
  // Bookings in the way are a list, never a line under a field.
  const inlineField = failure && !failure.details ? (invalid.find((field) => registered.has(field)) ?? null) : null;

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.result.ok) {
      setClosing(true);
      toast.success(state.result.message);
      onClose();
    } else if (inlineField) {
      // The first field the reason describes, in the order they are shown, then the reason under it. A group (the
      // weekdays) is marked as a whole and takes the focus on its first control.
      const marked = formRef.current?.querySelector<HTMLElement>(`[aria-describedby~="${CSS.escape(errorId)}"]`);
      const control = marked?.matches(FOCUSABLE) ? marked : marked?.querySelector<HTMLElement>(FOCUSABLE);
      control?.focus({ preventScroll: true });
      marked?.scrollIntoView({ block: "nearest" });
      document.getElementById(errorId)?.scrollIntoView({ block: "nearest" });
    } else {
      setErrorOpen(true);
    }
  }, [state, onClose, inlineField, errorId]);

  // Submitting inside a transition keeps React from resetting the form after the action, so a refusal loses nothing.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  const mark = (field: string): FieldMark => {
    if (!invalid.includes(field)) return {};
    return inlineField ? { "aria-invalid": true, "aria-describedby": errorId } : { "aria-invalid": true };
  };
  const error = (field: string): FieldError | null =>
    failure && field === inlineField ? { id: errorId, message: failure.message } : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={submit}
      aria-busy={pending}
      noValidate
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children ? (
        // The negative margins give the focus rings room inside the scrolling area.
        <div className="-mx-4 -my-1 min-h-0 flex-1 overflow-y-auto px-4 py-1">
          <FieldErrors value={{ mark, error, register }}>{children}</FieldErrors>
        </div>
      ) : null}

      {failure ? (
        <FormErrorDialog
          open={errorOpen}
          onOpenChange={(next) => {
            setErrorOpen(next);
            if (!next) requestAnimationFrame(() => submitRef.current?.focus());
          }}
          failure={failure}
          timeZone={timeZone}
          onRetry={() => {
            setErrorOpen(false);
            formRef.current?.requestSubmit();
          }}
        />
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button ref={submitRef} type="submit" variant={submitVariant} disabled={pending || closing}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
