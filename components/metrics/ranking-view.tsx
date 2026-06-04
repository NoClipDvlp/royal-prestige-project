"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Sparkline } from "@/components/metrics/sparkline";
import { cn } from "@/lib/cn";
import {
  GRAIN_LABEL,
  RANGE_LABEL,
  type ComplianceRange,
  type RankGrain,
  type RankingByRange,
  type RankRow,
  type SeriesPoint,
} from "@/lib/metrics/types";

const RANGE_OPTS = (["day", "week", "month"] as ComplianceRange[]).map((r) => ({ value: r, label: RANGE_LABEL[r] }));
const GRAIN_OPTS = (["user", "distribution"] as RankGrain[]).map((g) => ({ value: g, label: GRAIN_LABEL[g] }));

/** pct null ("Sin datos") al final; el resto por compliance_pct desc. */
function sortRows(rows: RankRow[]): RankRow[] {
  return [...rows].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}

/**
 * Ranking comparativo para Auditor/Admin (compliance_ranking) — toggle de rango y granularidad
 * (por distribuidor / por distribución). Solo agregados + nombre (users_labels / distributions); cero PII
 * de fila. Vista compacta v1. El cliente conmuta en memoria (los 3 rangos vienen precalculados).
 */
export function RankingView({
  data,
  sparklines,
}: {
  data: RankingByRange;
  sparklines?: Record<string, SeriesPoint[]>;
}) {
  const [range, setRange] = useState<ComplianceRange>("week");
  const [grain, setGrain] = useState<RankGrain>("user");

  const rows = sortRows(data[range].filter((r) => r.grain === grain));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={grain} onChange={setGrain} options={GRAIN_OPTS} ariaLabel="Granularidad" />
        <Segmented value={range} onChange={setRange} options={RANGE_OPTS} ariaLabel="Rango" />
      </div>

      {rows.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-muted">Sin datos para este rango.</GlassCard>
      ) : (
        <GlassCard className="divide-y divide-white/40 p-2 dark:divide-white/10">
          {rows.map((r, i) => {
            const body = (
              <>
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${r.pct ?? 0}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-muted">
                    {r.done}✓ · {r.half}◑ · {r.undone}○
                  </p>
                </div>
                {grain === "user" && (
                  <span className="hidden shrink-0 sm:block">
                    <Sparkline points={sparklines?.[r.id] ?? []} />
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 text-right text-sm font-semibold tabular-nums",
                    grain === "user" ? "w-14" : "w-16",
                    r.pct === null ? "text-muted" : "text-fg",
                  )}
                >
                  {r.pct === null ? "Sin datos" : `${r.pct}%`}
                </span>
                {grain === "user" && <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />}
              </>
            );
            // Solo el grano 'user' (distribuidor) abre perfil; 'distribution' no es un perfil de persona.
            return grain === "user" ? (
              <Link
                key={`${r.grain}-${r.id}`}
                href={`/metricas/${r.id}`}
                aria-label={`Ver perfil de ${r.name}`}
                className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/40 dark:hover:bg-white/5"
              >
                {body}
              </Link>
            ) : (
              <div key={`${r.grain}-${r.id}`} className="flex items-center gap-3 px-3 py-3">
                {body}
              </div>
            );
          })}
        </GlassCard>
      )}
    </div>
  );
}
