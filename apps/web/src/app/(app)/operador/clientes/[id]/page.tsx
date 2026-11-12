import Link from "next/link";
import { notFound } from "next/navigation";

import { getClient, listMembers, toOperatorClientView, toOperatorMemberView } from "@espacios/application";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { operatorEdge } from "@/composition";
import { requireOperator } from "@/lib/session/session";

import { Facts } from "../../_components/facts";
import { RecordStatusDot } from "../../_components/status";
import { AddMemberDialog } from "../_components/add-member-dialog";
import { ClientAvatar } from "../_components/client-avatar";
import { DeactivateClientButton, ReactivateClientButton } from "../_components/client-status-buttons";
import { EditClientDialog } from "../_components/edit-client-dialog";
import { MemberList } from "../_components/member-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator.client");
  return { title: t("detailTitle") };
}

/** One client (spec 0005, AC-9): its data and its members. An unknown id is a 404. */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOperator();
  const [{ id }, t, m] = await Promise.all([
    params,
    getTranslations("operator.client"),
    getTranslations("operator.member"),
  ]);
  const edge = operatorEdge();

  const [found, memberRecords] = await Promise.all([getClient(edge, actor, id), listMembers(edge, actor, id)]);
  if (!found.ok) {
    if (found.reason === "not_found") notFound();
    throw new Error(`getClient: ${found.reason}`);
  }
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!memberRecords.ok) throw new Error(`listMembers: ${memberRecords.reason}`);
  const client = toOperatorClientView(found.value);
  const members = memberRecords.value.map(toOperatorMemberView);
  // A person who works alone holds one member; the server still refuses a second (`individual_is_single`).
  const canAddMember = client.kind === "company" || members.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/operador/clientes"
          className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClientAvatar name={client.name} logoUrl={client.logoUrl} />
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <RecordStatusDot status={client.status} since={client.deactivatedAt} gender="m" />
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <EditClientDialog client={client} />
            {client.status === "active" ? (
              <DeactivateClientButton client={client} />
            ) : (
              <ReactivateClientButton client={client} />
            )}
          </div>
        </div>
        <Facts
          items={[
            { term: t("columns.kind"), value: t(`kinds.${client.kind}`) },
            { term: t("columns.slug"), value: client.slug },
            { term: m("title"), value: members.length },
          ]}
        />
      </div>

      <section aria-labelledby="members-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="members-title" className="text-lg font-semibold">
            {m("title")}
          </h2>
          {canAddMember ? <AddMemberDialog clientId={client.id} /> : null}
        </div>
        <MemberList members={members} />
      </section>
    </div>
  );
}
