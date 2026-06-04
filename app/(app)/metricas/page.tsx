import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile, type AppRole } from "@/lib/auth/server";
import { PageTitle } from "@/components/page-title";
import { GlassCard } from "@/components/ui/card";
import { ComplianceCard } from "@/components/metrics/compliance-card";
import { RankingView } from "@/components/metrics/ranking-view";
import { complianceByRanges, rankingByRanges, sparklinesByUser } from "@/lib/metrics/server";
import { bogotaToday } from "@/lib/dashboard/week";

// Métricas (ADR-0012). Role-aware: admin/auditor → ranking comparativo; distribuidor → sus métricas.
export default async function MetricasPage() {
  const { role } = await getProfile();
  if (role === null) redirect("/sin-rol");
  const isRanking = role === "admin" || role === "auditor";

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="Métricas"
        subtitle={
          isRanking
            ? "Comparativa entre distribuidores — cumplimiento ponderado por prioridad."
            : "Tu cumplimiento ponderado por prioridad (día / semana / mes)."
        }
      />
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
    return <RankingView data={ranking} sparklines={sparklines} />;
  }
  // distribuidor (y jd/seller futuros): sus propias métricas (compliance_self) — NO el ranking (gate → 0 filas).
  const compliance = await complianceByRanges(supabase, today);
  return <ComplianceCard data={compliance} defaultRange="week" />;
}

function MetricsSkeleton({ ranking }: { ranking: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="h-10 animate-pulse" />
      <GlassCard className={ranking ? "h-80 animate-pulse" : "h-52 animate-pulse"} />
    </div>
  );
}
