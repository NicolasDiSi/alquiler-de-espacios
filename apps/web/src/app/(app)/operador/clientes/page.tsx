import { listClients, toOperatorClientView } from "@espacios/application";
import { Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { operatorEdge } from "@/composition";
import { requireOperator } from "@/lib/session/session";

import { ClientList } from "./_components/client-list";
import { CreateClientDialog } from "./_components/create-client-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator.client");
  return { title: t("title") };
}

/** Clientes (spec 0005), on the operator edge: companies and people who work alone, active and retired. */
export default async function ClientsPage() {
  const { actor } = await requireOperator();
  const t = await getTranslations("operator.client");

  const result = await listClients(operatorEdge(), actor, true);
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!result.ok) throw new Error(`listClients: ${result.reason}`);
  const clients = result.value.map(toOperatorClientView);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <CreateClientDialog />
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("empty.title")}
          description={t("empty.description")}
          action={<CreateClientDialog />}
        />
      ) : (
        <ClientList clients={clients} />
      )}
    </div>
  );
}
