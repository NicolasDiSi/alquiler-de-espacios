import { getOperatorDashboard } from "@espacios/application";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { operatorReadEdge } from "@/composition";
import { TIME_ZONE } from "@/i18n/config";
import { PERIODOS, periodoOf } from "@/lib/operator/period";
import { requireOperator } from "@/lib/session/session";

import { PeriodPicker } from "../_components/period-picker";
import { CompanyUsageList } from "../_dashboard/company-usage-list";
import { DailyOccupancyChart } from "../_dashboard/daily-occupancy-chart";
import { KpiStrip } from "../_dashboard/kpi-strip";
import { OccupancyHeatmap } from "../_dashboard/occupancy-heatmap";
import { Recommendations } from "../_dashboard/recommendations";
import { RoomUsageChart } from "../_dashboard/room-usage-chart";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operator");
  return { title: t("title") };
}

/**
 * The operator dashboard (spec 0006), the operator's home on the operator edge. It reads only the period in the URL
 * (`?periodo=7d|30d|90d`, 30 days by default) through the same use cases as `/api/v1/operator/metrics/*`, never through
 * its own Route Handler. A member gets 403.
 */
export default async function OperatorDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor } = await requireOperator();
  const [t, params] = await Promise.all([getTranslations("operator"), searchParams]);
  const periodo = periodoOf(params.periodo);

  const result = await getOperatorDashboard(operatorReadEdge(), actor, {
    period: PERIODOS[periodo],
    timeZone: TIME_ZONE,
  });
  // A refusal here is a database that could not answer in time; error.tsx shows it with a retry.
  if (!result.ok) throw new Error(`getOperatorDashboard: ${result.reason}`);
  const dashboard = result.value;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <PeriodPicker path="/operador" current={periodo} range={dashboard.range} />
      </div>

      <KpiStrip dashboard={dashboard}>
        <DailyOccupancyChart daily={dashboard.daily} highlight={dashboard.range} />
      </KpiStrip>

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <OccupancyHeatmap heatmap={dashboard.heatmap} />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <RoomUsageChart rooms={dashboard.rooms} />
        </div>
      </div>

      <CompanyUsageList companies={dashboard.companies} />

      <Recommendations insights={dashboard.insights} />
    </div>
  );
}
