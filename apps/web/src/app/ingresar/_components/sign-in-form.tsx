"use client";

import { useActionState } from "react";

import type { SignInChoicesView } from "@espacios/application";
import { Building2, ChartColumn } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { type SignInState, signInAs } from "../_actions/session";

const INITIAL_STATE: SignInState = { error: null };

/**
 * One form for every user: the pressed button sends its `userId`. While the action runs every button is disabled,
 * so a double click signs in once.
 */
export function SignInForm({ choices }: { choices: SignInChoicesView }) {
  const t = useTranslations("signIn");
  const [state, formAction, pending] = useActionState(signInAs, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-6" aria-busy={pending}>
      {state.error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="companies-heading" className="flex flex-col gap-3">
        <h2 id="companies-heading" className="text-muted-foreground text-sm font-medium">
          {t("companies")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {choices.companies.map((company) => (
            <li key={company.id} className="bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-sm">
              <h3 className="flex items-center gap-2 font-semibold">
                <Building2 aria-hidden className="text-primary size-4" />
                {company.name}
              </h3>
              <ul className="flex flex-col gap-2">
                {company.users.map((user) => (
                  <li key={user.id}>
                    <Button
                      type="submit"
                      name="userId"
                      value={user.id}
                      variant="outline"
                      disabled={pending}
                      className="w-full justify-start"
                    >
                      {t("enterAs", { name: user.name })}
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {choices.operators.length > 0 ? (
        <section
          aria-labelledby="operator-heading"
          className="bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-sm"
        >
          <div className="space-y-1">
            <h2 id="operator-heading" className="flex items-center gap-2 font-semibold">
              <ChartColumn aria-hidden className="text-primary size-4" />
              {t("operator.title")}
            </h2>
            <p className="text-muted-foreground">{t("operator.description")}</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {choices.operators.map((user) => (
              <li key={user.id}>
                <Button type="submit" name="userId" value={user.id} disabled={pending}>
                  {t("enterAs", { name: user.name })}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
