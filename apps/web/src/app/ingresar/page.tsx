// Layout adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/(main)/auth/v2/login/page.tsx: one
// centered column. The email and password form is replaced by the "sign in as" profiles (spec 0002).
import { connection } from "next/server";

import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { userDirectory } from "@/composition";

import packageJson from "../../../package.json" with { type: "json" };
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
    <main className="bg-background flex min-h-dvh items-center justify-center p-4 md:p-6">
      <div className="bg-card text-card-foreground w-full max-w-xl overflow-hidden rounded-xl border shadow-sm">
        <div className="space-y-1 px-6 pt-6 pb-2">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <Badge variant="secondary" className="font-normal">
              {t("version", { version: packageJson.version })}
            </Badge>
          </div>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        {empty ? (
          <div className="p-6">
            <EmptyState icon={UsersRound} title={t("empty.title")} description={t("empty.description")} />
          </div>
        ) : (
          <SignInForm choices={choices} />
        )}
      </div>
    </main>
  );
}
