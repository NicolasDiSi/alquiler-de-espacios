"use client";

import { type ReactNode, useActionState, useEffect, useId, useState } from "react";

import type { SignInChoicesView } from "@espacios/application";
import { ArrowRight, Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { ErrorDialog } from "@/components/error-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initialsOf } from "@/lib/operator/format";

import { type SignInState, signInAs } from "../_actions/session";

const INITIAL_STATE: SignInState = { error: null };

/** A user id no seed or generator produces: "Simular error" posts it to show the real refusal. */
const SIMULATED_ERROR_ID = "simulated-unknown-user";

/**
 * One form for every profile: the pressed button sends its `userId`. While the action runs every button is disabled,
 * so a double click signs in once. A refusal (the user no longer exists) opens its reason in an `ErrorDialog`.
 */
export function SignInForm({ choices }: { choices: SignInChoicesView }) {
  const t = useTranslations("signIn");
  const [state, formAction, pending] = useActionState(signInAs, INITIAL_STATE);
  const [errorOpen, setErrorOpen] = useState(false);
  // Each answer is a new object, so a second refusal opens the dialog again.
  useEffect(() => setErrorOpen(state.error !== null), [state]);
  const companyCount = choices.companies.reduce((sum, company) => sum + company.users.length, 0);

  return (
    <form action={formAction} aria-busy={pending}>
      <div className="flex flex-col gap-5 px-6 pt-3 pb-5">
        {state.error ? <ErrorDialog open={errorOpen} onOpenChange={setErrorOpen} message={t(state.error)} /> : null}

        {companyCount > 0 ? (
          <ProfileGroup title={t("companies")} aside={t("profiles", { count: companyCount })}>
            {choices.companies.flatMap((company) =>
              company.users.map((user) =>
                company.kind === "individual" ? (
                  <ProfileRow
                    key={user.id}
                    id={user.id}
                    name={user.name}
                    tag={
                      <Badge className="bg-info/15 text-info h-4 px-1.5 text-[0.625rem] tracking-wide uppercase">
                        {t("individual")}
                      </Badge>
                    }
                    detail={t("individualMember")}
                    pending={pending}
                  />
                ) : (
                  <ProfileRow
                    key={user.id}
                    id={user.id}
                    name={user.name}
                    tag={company.name}
                    detail={t("companyMember", { count: company.users.length })}
                    pending={pending}
                  />
                ),
              ),
            )}
          </ProfileGroup>
        ) : null}

        {choices.operators.length > 0 ? (
          <ProfileGroup title={t("operator.title")} aside={t("profiles", { count: choices.operators.length })}>
            {choices.operators.map((user) => (
              <ProfileRow
                key={user.id}
                id={user.id}
                name={user.name}
                // The seeded operator is called "Operador": the role is not repeated next to it.
                tag={user.name === t("operator.role") ? null : t("operator.role")}
                detail={t("operator.description")}
                pending={pending}
              />
            ))}
          </ProfileGroup>
        ) : null}
      </div>

      <div className="bg-muted/60 text-muted-foreground flex items-center justify-between gap-4 border-t px-6 py-3 text-xs">
        <p className="flex items-center gap-1.5">
          <Info aria-hidden className="size-3.5" />
          {t("demoNotice")}
        </p>
        <Button
          type="submit"
          name="userId"
          value={SIMULATED_ERROR_ID}
          variant="link"
          size="xs"
          disabled={pending}
          className="text-muted-foreground hover:text-foreground h-auto p-0 text-xs underline decoration-dotted underline-offset-4"
        >
          {t("simulateError")}
        </Button>
      </div>
    </form>
  );
}

function ProfileGroup({
  title,
  aside,
  children,
}: {
  readonly title: string;
  readonly aside: string;
  readonly children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {title}
        </h2>
        <span className="text-muted-foreground text-xs">{aside}</span>
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

/** The whole row is clickable: the "Ingresar" button stretches over it, so there is one control per profile. */
function ProfileRow({
  id,
  name,
  tag,
  detail,
  pending,
}: {
  readonly id: string;
  readonly name: string;
  readonly tag: ReactNode;
  readonly detail: string;
  readonly pending: boolean;
}) {
  const t = useTranslations("signIn");
  return (
    <li className="hover:bg-muted/60 has-focus-visible:bg-muted/60 relative flex items-center gap-3 rounded-lg px-2 py-2 transition-colors">
      <span
        aria-hidden
        className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-md text-base font-semibold"
      >
        {initialsOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="font-medium">{name}</span>
          {typeof tag === "string" ? (
            <>
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
              <span className="truncate">{tag}</span>
            </>
          ) : (
            tag
          )}
        </p>
        <p className="text-muted-foreground truncate text-xs">{detail}</p>
      </div>
      <Button
        type="submit"
        name="userId"
        value={id}
        variant="link"
        size="sm"
        disabled={pending}
        className="shrink-0 after:absolute after:inset-0 after:rounded-lg hover:no-underline"
      >
        {t("enter")}
        <span className="sr-only"> {t("enterAs", { name })}</span>
        <ArrowRight aria-hidden data-icon="inline-end" />
      </Button>
    </li>
  );
}
