"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, Minus } from "lucide-react";
import { useDensity } from "@/components/ui/density";
import { GlassCard } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Sparkline } from "@/components/metrics/sparkline";
import { cn } from "@/lib/cn";
import { densityClasses } from "@/lib/density";
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
 * DELTA accionable: cambio del último bucket CON datos vs el anterior con datos (semanal,
 * compliance_series_by_user). Señal principal del ranking — flecha + magnitud (pts) + color
 * (verde sube / rojo baja / neutro plano). "—" si no hay período anterior. Cero datos nuevos:
 * sale del mismo prop `sparklines` que ya alimenta la sparkline.
 */
function Delta({ points }: { points?: SeriesPoint[] }) {
  const withData = (points ?? []).filter((p) => p.pct !== null);
  const cls = "inline-flex w-11 shrink-0 items-center justify-end gap-0.5 text-[11px] font-medium tabular-nums";

  if (withData.length < 2) {
    return (
      <span className={cn(cls, "text-muted/50")} aria-label="Sin período anterior">
        —
      </span>
    );
  }
  const last = withData[withData.length - 1].pct as number;
  const prev = withData[withData.length - 2].pct as number;
  const d = last - prev;

  if (d === 0) {
    return (
      <span className={cn(cls, "text-muted")} aria-label="Sin cambios vs el período anterior">
        <Minus size={12} aria-hidden />0
      </span>
    );
  }
  const up = d > 0;
  return (
    <span
      className={cn(cls, up ? "text-positive" : "text-red-500 dark:text-red-400")}
      aria-label={`${up ? "Subió" : "Bajó"} ${Math.abs(d)} puntos vs el período anterior`}
    >
      {up ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
      {Math.abs(d)}
    </span>
  );
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
  const { density } = useDensity();
  const d = densityClasses(density);
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
        <GlassCard className={cn("divide-y divide-white/40 dark:divide-white/10", d.listPad)}>
          {rows.map((r, i) => {
            const body = (
              <>
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${r.pct ?? 0}%` }} />
                  </div>
                  {d.showSecondary && (
                    <p className="mt-1 text-[10px] text-muted">
                      {r.done}✓ · {r.half}◑ · {r.undone}○
                    </p>
                  )}
                </div>
                {grain === "user" && (
                  <span className="hidden shrink-0 sm:block">
                    <Sparkline points={sparklines?.[r.id] ?? []} />
                  </span>
                )}
                {grain === "user" && <Delta points={sparklines?.[r.id]} />}
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
                className={cn("flex items-center rounded-xl transition hover:bg-white/40 dark:hover:bg-white/5", d.rowGap, d.rowPad)}
              >
                {body}
              </Link>
            ) : (
              <div key={`${r.grain}-${r.id}`} className={cn("flex items-center", d.rowGap, d.rowPad)}>
                {body}
              </div>
            );
          })}
        </GlassCard>
      )}
    </div>
  );
}
