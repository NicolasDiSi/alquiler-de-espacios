"use client";

import {
  type ComponentProps,
  type FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import Link from "next/link";

import type { RoomView } from "@espacios/application";
import { endTimes } from "@espacios/domain";
import { cn } from "cn";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { BookingFormField, BookingFormValues } from "@/lib/bookings/input";

import { type BookingFormState, bookRoom } from "../_actions/book-room";
import { startChoices, withChange } from "../_lib/form-options";
import { DateField } from "./date-field";

/**
 * Native selects with the look of the shadcn `Input`: they post with the form, disable single options, and keep the
 * platform's own keyboard, screen reader and phone pickers.
 */
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2 text-base outline-none focus-visible:ring-3 aria-invalid:ring-3 md:text-sm";

function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(SELECT_CLASS, className)} {...props} />;
}

export type BookingFormProps = {
  readonly rooms: readonly RoomView[];
  readonly initialValues: BookingFormValues;
  /** The server's clock at render, ISO (spec 0003, Value sourcing): which days and starts are offered. */
  readonly now: string;
};

/**
 * The booking form (spec 0003). It posts `roomId`, `date`, `start` and `end` to the `bookRoom` Server Action. The
 * fields are controlled and the form is not reset after the action, so a refusal keeps every value. The alert takes
 * focus, and the fields it names are marked invalid and linked to it; `busy` offers a retry with the same values and
 * `unauthenticated` a link to the picker. Submit is disabled while the action runs, so a double click books once.
 */
export function BookingForm({ rooms, initialValues, now: nowIso }: BookingFormProps) {
  const t = useTranslations("bookingForm");
  const [state, formAction, pending] = useActionState<BookingFormState, FormData>(bookRoom, null);
  const [values, setValues] = useState(initialValues);
  const [now] = useState(() => new Date(nowIso));
  const alertRef = useRef<HTMLDivElement>(null);
  const alertId = useId();

  useEffect(() => {
    if (state) alertRef.current?.focus();
  }, [state]);

  // React resets a `<form action>` once its action finishes, which would clear the selects after a refusal. Submitting
  // from `onSubmit` inside a transition skips that reset; `action` stays for a browser without JavaScript.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  const change = (field: BookingFormField, value: string) =>
    setValues((current) => withChange(current, field, value, now));

  const invalid = new Set<BookingFormField>(state?.invalidFields ?? []);
  const fieldProps = (field: BookingFormField) => ({
    id: `booking-${field}`,
    name: field,
    value: values[field],
    onChange: (event: { target: { value: string } }) => change(field, event.target.value),
    "aria-invalid": invalid.has(field) || undefined,
    "aria-describedby": invalid.has(field) ? alertId : undefined,
  });

  const reason = state?.result.reason;

  return (
    <form action={formAction} onSubmit={submit} className="flex max-w-xl flex-col gap-5" aria-busy={pending} noValidate>
      {state ? (
        <Alert ref={alertRef} id={alertId} variant="destructive" tabIndex={-1} className="outline-none">
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{state.result.message}</span>
            {reason === "busy" ? (
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                {t("retry")}
              </Button>
            ) : null}
            {reason === "unauthenticated" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/ingresar">{t("signInAgain")}</Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-roomId">{t("room")}</Label>
        <NativeSelect {...fieldProps("roomId")} required>
          <option value="">{t("roomPlaceholder")}</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {t("roomOption", { name: room.name, capacity: room.capacity })}
            </option>
          ))}
        </NativeSelect>
      </div>

      <DateField
        value={values.date}
        onChange={(date) => change("date", date)}
        now={now}
        invalid={invalid.has("date")}
        errorId={alertId}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="booking-start">{t("start")}</Label>
          <NativeSelect {...fieldProps("start")} required>
            <option value="">{t("timePlaceholder")}</option>
            {startChoices(values.date, now).map((option) => (
              <option key={option.time} value={option.time} disabled={option.disabled}>
                {option.time}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="booking-end">{t("end")}</Label>
          <NativeSelect {...fieldProps("end")} required>
            <option value="">{values.start ? t("timePlaceholder") : t("endNeedsStart")}</option>
            {endTimes(values.start).map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
