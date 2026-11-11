// Adapted from Studio Admin (nextjs-templates, develop f19e0ef), src/app/not-found.tsx.
import Link from "next/link";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-2 p-4 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Button asChild variant="outline" className="mt-2">
        <Link prefetch={false} replace href="/">
          {t("back")}
        </Link>
      </Button>
    </main>
  );
}
