import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/server";
import { PageTitle } from "@/components/page-title";
import { CargaPremium } from "@/components/metrics/carga-premium";
import { loadForecast, loadComplianceDrill, buildInsights, forecastBounds } from "@/lib/bi/premium";
import { bogotaToday } from "@/lib/dashboard/week";
import { addDays } from "@/lib/tasks/dates";

// Vista premium de carga + cumplimiento con drill + insights (ADR-0030). admin/auditor-only (las funciones BI
// también gatean por rol). Carga = futuro (mañana…14d); cumplimiento = pasado (capado a hoy).
export default async function CargaPage() {
  const { role } = await getProfile();
  if (role === null) redirect("/sin-rol");
  if (role !== "admin" && role !== "auditor") redirect("/"); // defensa en profundidad (la RPC ya gatea)

  const supabase = await createSupabaseServerClient();
  const today = bogotaToday();
  const fb = forecastBounds("next7", today);
  const past = { dStart: addDays(today, -6), dEnd: today };
  const [forecastDist, complianceDist] = await Promise.all([
    loadForecast(supabase, { ...fb, dimension: "distribution" }),
    loadComplianceDrill(supabase, { ...past, dimension: "distribution" }),
  ]);
  const insights = buildInsights(forecastDist, complianceDist);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/metricas" className="inline-flex w-fit items-center gap-1 text-sm text-muted transition hover:text-fg">
        <ChevronLeft size={16} /> Ranking
      </Link>
      <PageTitle title="Carga y cumplimiento" subtitle="Carga por venir + cumplimiento con drill + señales por reglas." />
      <CargaPremium initialForecast={forecastDist} initialCompliance={complianceDist} insights={insights} today={today} />
    </div>
  );
}
