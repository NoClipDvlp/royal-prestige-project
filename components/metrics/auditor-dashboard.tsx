"use client";

import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Info,
  Users2,
  Grid3x3,
} from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Sparkline } from "@/components/metrics/sparkline";
import type { TeamDistribution, Mover, Heatmap } from "@/lib/bi/dashboard";
import type { Insight } from "@/lib/bi/premium";
import type { RankRow, SeriesPoint } from "@/lib/metrics/types";

const INSIGHT_TONE = {
  warn: { cls: "border-amber-500/30 bg-amber-500/10 text-amber-600", Icon: AlertTriangle },
  good: { cls: "border-positive/30 bg-positive/10 text-positive", Icon: CheckCircle2 },
  info: { cls: "border-white/40 bg-white/40 text-muted dark:bg-white/5", Icon: Info },
} as const;

function pctTone(pct: number | null): string {
  if (pct == null) return "bg-white/30 text-muted dark:bg-white/5";
  if (pct < 60) return "bg-red-500/80 text-white";
  if (pct < 80) return "bg-amber-500/80 text-white";
  return "bg-positive/80 text-white";
}

/** Dashboard cohesivo del auditor (ADR-0033): insights + distribución + movimiento + heatmap + ranking +
 *  carga. Reemplaza el toggle rango/grano inútil. Drill por clic al perfil. Solo agregados (sin PII de fila). */
export function AuditorDashboard({
  ranking,
  sparklines,
  distribution,
  movers,
  heatmap,
  insights,
}: {
  ranking: RankRow[];
  sparklines: Record<string, SeriesPoint[]>;
  distribution: TeamDistribution;
  movers: Mover[];
  heatmap: Heatmap;
  insights: Insight[];
}) {
  const ranked = [...ranking].filter((r) => r.grain === "user").sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const weakestCat = (userId: string): string | null => {
    const row = heatmap.rows.find((r) => r.userId === userId);
    if (!row) return null;
    let worst: { cat: string; pct: number } | null = null;
    for (const [cat, cell] of Object.entries(row.cells)) {
      if (cell.pct == null) continue;
      if (!worst || cell.pct < worst.pct) worst = { cat, pct: cell.pct };
    }
    return worst ? `${worst.cat} (${worst.pct}%)` : null;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Insights */}
      {insights.length > 0 && (
        <div className="flex flex-col gap-2">
          {insights.map((it, i) => {
            const t = INSIGHT_TONE[it.tone];
            return (
              <div key={i} className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs font-medium ${t.cls}`}>
                <t.Icon size={14} className="mt-0.5 shrink-0" />
                <span>{it.text}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Distribución del equipo */}
        <GlassCard className="p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Users2 size={15} /> Distribución del equipo
          </p>
          {distribution.median == null ? (
            <p className="text-xs text-muted">Sin datos suficientes.</p>
          ) : (
            <>
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-2xl font-semibold text-fg">{distribution.median}%</p>
                  <p className="text-[11px] text-muted">mediana</p>
                </div>
                <div className="flex gap-3 pb-1 text-xs text-muted">
                  <span>{distribution.loLabel} <b className="text-fg">{distribution.lo}%</b></span>
                  <span>{distribution.hiLabel} <b className="text-fg">{distribution.hi}%</b></span>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Base: {distribution.n} distribuidor{distribution.n === 1 ? "" : "es"} · {distribution.basis}
              </p>
              {(distribution.outliersLow.length > 0 || distribution.outliersHigh.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {distribution.outliersLow.map((o) => (
                    <span key={o.name} className="rounded-lg bg-red-500/15 px-2 py-0.5 text-[11px] text-red-600">
                      ▼ {o.name} {o.pct}%
                    </span>
                  ))}
                  {distribution.outliersHigh.map((o) => (
                    <span key={o.name} className="rounded-lg bg-positive/15 px-2 py-0.5 text-[11px] text-positive">
                      ▲ {o.name} {o.pct}%
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </GlassCard>

        {/* Movimiento */}
        <GlassCard className="p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
            <TrendingUp size={15} /> Movimiento (vs semana previa)
          </p>
          {movers.length === 0 ? (
            <p className="text-xs text-muted">Sin cambios marcados.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {movers.slice(0, 6).map((m) => {
                const down = m.delta < 0;
                const weak = down ? weakestCat(m.id) : null;
                return (
                  <li key={m.id} className="flex items-center gap-2 text-xs">
                    <span className={`inline-flex w-12 shrink-0 items-center gap-0.5 font-medium tabular-nums ${down ? "text-red-500" : "text-positive"}`}>
                      {down ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                      {Math.abs(m.delta)}
                    </span>
                    <span className="flex-1 truncate text-fg">{m.name}</span>
                    {weak && <span className="shrink-0 text-[10px] text-muted">flojo: {weak}</span>}
                    <span className="w-9 shrink-0 text-right text-muted tabular-nums">{m.last}%</span>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Heatmap distribuidor × categoría */}
      {heatmap.rows.length > 0 && heatmap.categories.length > 0 && (
        <GlassCard className="overflow-x-auto p-0">
          <div className="border-b border-white/40 px-4 py-2.5 dark:border-white/10">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Grid3x3 size={15} /> Heatmap · distribuidor × categoría (últimos 30 días)
            </p>
            <p className="text-[11px] text-muted">Cumplimiento por celda. Una columna floja en todos → proceso, no persona.</p>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-muted">
                <th className="sticky left-0 bg-white/95 px-3 dark:bg-[#10131c] py-2 text-left font-medium">Distribuidor</th>
                {heatmap.categories.map((c) => (
                  <th key={c} className="px-2 py-2 text-center font-medium">
                    <span className="block max-w-[5rem] truncate">{c}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.rows.map((r) => (
                <tr key={r.userId} className="border-t border-white/30 dark:border-white/10">
                  <td className="sticky left-0 bg-white/95 px-3 dark:bg-[#10131c] py-1.5 text-fg">
                    <Link href={`/metricas/${r.userId}`} className="truncate transition hover:underline">{r.name}</Link>
                  </td>
                  {heatmap.categories.map((c) => {
                    const cell = r.cells[c];
                    return (
                      <td key={c} className="px-1 py-1 text-center">
                        <span
                          className={`inline-block min-w-[2.25rem] rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${pctTone(cell?.pct ?? null)}`}
                          title={cell ? `${cell.total} tareas` : "sin datos"}
                        >
                          {cell?.pct == null ? "—" : `${cell.pct}`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {heatmap.truncated > 0 && (
            <p className="px-4 py-2 text-[11px] text-muted">…{heatmap.truncated} distribuidores más no mostrados (tope de la vista).</p>
          )}
        </GlassCard>
      )}

      {/* Ranking comparativo (lista, drill al perfil) */}
      <GlassCard className="divide-y divide-white/40 p-1 dark:divide-white/10">
        <p className="px-3 py-2 text-sm font-semibold text-fg">Ranking · cumplimiento semanal</p>
        {ranked.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted">Sin datos esta semana.</p>
        ) : (
          ranked.map((r, i) => (
            <Link
              key={r.id}
              href={`/metricas/${r.id}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/40 dark:hover:bg-white/5"
            >
              <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${r.pct ?? 0}%` }} />
                </div>
              </div>
              <span className="hidden shrink-0 sm:block">
                <Sparkline points={sparklines?.[r.id] ?? []} />
              </span>
              <span className={`w-14 shrink-0 text-right text-sm font-semibold tabular-nums ${r.pct == null ? "text-muted" : "text-fg"}`}>
                {r.pct == null ? "Sin datos" : `${r.pct}%`}
              </span>
              <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
            </Link>
          ))
        )}
      </GlassCard>

      {/* Carga futura (ADR-0030) — enlazada, no duplicada */}
      <Link href="/metricas/carga" className="block">
        <GlassCard className="flex items-center gap-3 p-4 transition hover:opacity-90">
          <span className="shrink-0 rounded-xl bg-accent/15 p-2 text-accent">
            <TrendingUp size={20} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">Carga por venir + drill</p>
            <p className="text-xs text-muted">Tareas agendadas mañana / próximas 2 semanas, por distribución, distribuidor y categoría.</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-muted" />
        </GlassCard>
      </Link>
    </div>
  );
}
