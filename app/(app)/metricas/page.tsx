import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile, type AppRole } from "@/lib/auth/server";
import { PageTitle } from "@/components/page-title";
import { MetricsSkeleton } from "@/components/skeletons";
import { RefreshButton } from "@/components/metrics/refresh-button";
import { ComplianceCard } from "@/components/metrics/compliance-card";
import { AuditorDashboard } from "@/components/metrics/auditor-dashboard";
import { complianceByRanges, rankingByRanges, sparklinesByUser } from "@/lib/metrics/server";
import { loadHeatmap, teamDistribution, computeMovers, buildDashboardInsights } from "@/lib/bi/dashboard";
import { bogotaToday } from "@/lib/dashboard/week";

// Métricas (ADR-0012). Role-aware: admin/auditor → ranking comparativo; distribuidor → sus métricas.
export default async function MetricasPage() {
  const { role } = await getProfile();
  if (role === null) redirect("/sin-rol");
  const isRanking = role === "admin" || role === "auditor";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <PageTitle
          title="Métricas"
          subtitle={
            isRanking
              ? "Comparativa entre distribuidores — cumplimiento ponderado por prioridad."
              : "Tu cumplimiento ponderado por prioridad (día / semana / mes)."
          }
        />
        <div className="flex shrink-0 items-center gap-2">
          {isRanking && (
            <Link
              href="/metricas/carga"
              className="inline-flex items-center gap-1.5 rounded-xl glass elev-1 px-3 py-1.5 text-xs font-medium text-fg transition hover:opacity-90"
            >
              <TrendingUp size={14} /> Carga + drill
            </Link>
          )}
          <RefreshButton />
        </div>
      </div>
      <Suspense fallback={<MetricsSkeleton ranking={isRanking} />}>
        <MetricsData role={role} />
      </Suspense>
    </div>
  );
}

async function MetricsData({ role }: { role: AppRole }) {
  const supabase = await createSupabaseServerClient();
  const today = bogotaToday();

  if (role === "admin" || role === "auditor") {
    const [ranking, sparklines] = await Promise.all([
      rankingByRanges(supabase, today),
      sparklinesByUser(supabase, today),
    ]);
    const weekUsers = ranking.week.filter((r) => r.grain === "user");
    const heatmap = await loadHeatmap(supabase, today, weekUsers.map((r) => ({ id: r.id, name: r.name })));
    const distribution = teamDistribution(weekUsers);
    const movers = computeMovers(sparklines, new Map(weekUsers.map((r) => [r.id, r.name])));
    const insights = buildDashboardInsights(distribution, movers, heatmap);
    return (
      <AuditorDashboard
        ranking={ranking.week}
        sparklines={sparklines}
        distribution={distribution}
        movers={movers}
        heatmap={heatmap}
        insights={insights}
      />
    );
  }
  // distribuidor (y jd/seller futuros): sus propias métricas (compliance_self) — NO el ranking (gate → 0 filas).
  const compliance = await complianceByRanges(supabase, today);
  return <ComplianceCard data={compliance} defaultRange="week" />;
}
