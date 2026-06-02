"use client";

import { GlassCard } from "@/components/ui/card";
import { PageTitle } from "@/components/page-title";
import { useDensity } from "@/components/ui/density";
import { cn } from "@/lib/cn";
import { mockWeekly } from "@/lib/mock";

const trend = [62, 70, 58, 81, 74, 68, 90]; // % por día (mock)
const days = ["L", "M", "X", "J", "V", "S", "D"];

export default function MetricasPage() {
  const { density } = useDensity();
  const gap = density === "compact" ? "gap-3" : "gap-5";
  const pad = density === "compact" ? "p-4" : "p-6";

  return (
    <div className={cn("flex flex-col", gap)}>
      <PageTitle
        title="Métricas"
        subtitle="Cumplimiento ponderado por prioridad. Mock — sin datos reales."
      />

      <GlassCard className={pad}>
        <p className="text-sm text-muted">Cumplimiento semanal</p>
        <p className="mt-1 text-3xl font-semibold text-fg">{mockWeekly.goalPct}%</p>
        <div className="mt-4">
          <div className="flex h-28 items-end gap-2">
            {trend.map((v, i) => (
              <div
                key={days[i]}
                className="flex-1 rounded-t-lg bg-accent/80"
                style={{ height: `${v}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            {days.map((d) => (
              <span key={d} className="flex-1 text-center text-[10px] text-muted">
                {d}
              </span>
            ))}
          </div>
        </div>
      </GlassCard>

      <GlassCard className={pad}>
        <p className="mb-2 text-sm font-semibold text-fg">Comparativa entre distribuidores</p>
        <p className="text-sm text-muted">
          El ranking (visible para Auditor/Admin) se conecta con datos reales — vía RLS — en un hito
          posterior. Placeholder.
        </p>
      </GlassCard>
    </div>
  );
}
