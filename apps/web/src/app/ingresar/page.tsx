import { connection } from "next/server";

import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { userDirectory } from "@/composition";

import { SignInForm } from "./_components/sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signIn");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** The "sign in as" picker (spec 0002): outside the shell, reachable signed in or not, so you can switch users. */
export default async function SignInPage() {
  // The users come from the database on every request, never from the build.
  await connection();
  const [t, choices] = await Promise.all([getTranslations("signIn"), userDirectory().listSignInChoices()]);
  const empty = choices.companies.length === 0 && choices.operators.length === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center gap-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground max-w-2xl">{t("description")}</p>
      </div>
      {empty ? (
        <EmptyState icon={UsersRound} title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <SignInForm choices={choices} />
      )}
    </main>
  );
}
