import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile, type AppRole } from "@/lib/auth/server";
import { GlassCard } from "@/components/ui/card";
import { ProfileSkeleton } from "@/components/skeletons";
import { RefreshButton } from "@/components/metrics/refresh-button";
import { TrendChart } from "@/components/metrics/trend-chart";
import { BreakdownList } from "@/components/metrics/breakdown-list";
import { LiveTasks } from "@/components/metrics/live-tasks";
import { breakdownByDims, fetchLabel, seriesByBuckets } from "@/lib/metrics/server";
import { bogotaToday } from "@/lib/dashboard/week";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Perfil del distribuidor que abre el auditor (ADR-0013). admin/auditor-only; p_user = ese distribuidor.
export default async function ProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { role } = await getProfile();
  if (role === null) redirect("/sin-rol");
  if (role !== "admin" && role !== "auditor") redirect("/"); // defensa en profundidad (la RPC ya gatea)
  if (!UUID_RE.test(userId)) redirect("/metricas");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/metricas" className="inline-flex w-fit items-center gap-1 text-sm text-muted transition hover:text-fg">
          <ChevronLeft size={16} /> Ranking
        </Link>
        <RefreshButton />
      </div>
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileData userId={userId} role={role} />
      </Suspense>
    </div>
  );
}

async function ProfileData({ userId, role }: { userId: string; role: AppRole }) {
  const supabase = await createSupabaseServerClient();
  const today = bogotaToday();

  const [label, series, breakdown] = await Promise.all([
    fetchLabel(supabase, userId),
    seriesByBuckets(supabase, userId, today),
    breakdownByDims(supabase, userId, today),
  ]);

  return (
    <>
      <GlassCard className="p-6">
        <p className="text-xs uppercase tracking-wide text-muted">Perfil del distribuidor</p>
        <h1 className="mt-1 text-2xl font-semibold text-fg">{label.name}</h1>
        {label.distributionName && <p className="text-sm text-muted">{label.distributionName}</p>}
      </GlassCard>

      <TrendChart series={series} />
      <BreakdownList data={breakdown} />
      {/* ADR-0031: estado VIVO de las tareas (admin; auditor ve agregados por la frontera PII). */}
      <LiveTasks userId={userId} canSeeDetail={role === "admin"} />
    </>
  );
}
