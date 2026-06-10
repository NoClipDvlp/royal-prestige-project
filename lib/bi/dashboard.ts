// Dashboard cohesivo del auditor (ADR-0033). NO-CORE: deriva de funciones BI existentes.
//  - Distribución del equipo: percentiles/cuartiles + outliers desde compliance_ranking (adaptado al N real).
//  - Movimiento: subió/bajó vs semana previa desde las sparklines (compliance_series_by_user).
//  - Heatmap distribuidor×categoría: N llamadas a compliance_breakdown(category, p_user) (derivado, sin core).
// Insights por reglas que CITAN el número (no LLM).

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/tasks/dates";
import type { Insight } from "@/lib/bi/premium";
import type { RankRow, SeriesPoint } from "@/lib/metrics/types";

type DB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// ── 1) Distribución del equipo ────────────────────────────────────────────────
export type TeamDistribution = {
  n: number;
  basis: "cuartiles" | "min-mediana-max" | "insuficiente";
  median: number | null;
  lo: number | null;
  hi: number | null;
  loLabel: string;
  hiLabel: string;
  outliersLow: { name: string; pct: number }[];
  outliersHigh: { name: string; pct: number }[];
};

function quantile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Distribución sobre el ranking (grano user, con pct). Con N chico usa min/mediana/max (sin falsa precisión). */
export function teamDistribution(rows: RankRow[]): TeamDistribution {
  const vals = rows.filter((r) => r.pct != null).map((r) => ({ name: r.name, pct: r.pct as number }));
  const n = vals.length;
  if (n === 0) return { n: 0, basis: "insuficiente", median: null, lo: null, hi: null, loLabel: "", hiLabel: "", outliersLow: [], outliersHigh: [] };
  const sorted = vals.map((v) => v.pct).sort((a, b) => a - b);
  const median = Math.round(quantile(sorted, 0.5));

  if (n < 5) {
    const min = vals.slice().sort((a, b) => a.pct - b.pct)[0];
    const max = vals.slice().sort((a, b) => b.pct - a.pct)[0];
    return {
      n,
      basis: "min-mediana-max",
      median,
      lo: min.pct,
      hi: max.pct,
      loLabel: "mín",
      hiLabel: "máx",
      outliersLow: min.pct < median - 20 ? [min] : [],
      outliersHigh: [],
    };
  }
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return {
    n,
    basis: "cuartiles",
    median,
    lo: Math.round(q1),
    hi: Math.round(q3),
    loLabel: "P25",
    hiLabel: "P75",
    outliersLow: vals.filter((v) => v.pct < q1 - 1.5 * iqr).sort((a, b) => a.pct - b.pct),
    outliersHigh: vals.filter((v) => v.pct > q3 + 1.5 * iqr).sort((a, b) => b.pct - a.pct),
  };
}

// ── 2) Movimiento (delta semana vs previa, de las sparklines) ─────────────────
export type Mover = { id: string; name: string; delta: number; last: number };

export function computeMovers(sparklines: Record<string, SeriesPoint[]>, nameById: Map<string, string>): Mover[] {
  const out: Mover[] = [];
  for (const [id, pts] of Object.entries(sparklines)) {
    const withData = pts.filter((p) => p.pct != null);
    if (withData.length < 2) continue;
    const last = withData[withData.length - 1].pct as number;
    const prev = withData[withData.length - 2].pct as number;
    if (last - prev === 0) continue;
    out.push({ id, name: nameById.get(id) ?? "—", delta: last - prev, last });
  }
  return out.sort((a, b) => a.delta - b.delta); // caídas primero
}

// ── 3) Heatmap distribuidor × categoría (derivado: N llamadas) ────────────────
export type HeatCell = { pct: number | null; total: number };
export type Heatmap = {
  categories: string[];
  rows: { userId: string; name: string; cells: Record<string, HeatCell> }[];
  truncated: number; // distribuidores omitidos por el tope (transparencia, no silencioso)
};

const HEATMAP_MAX_USERS = 30;

type BreakdownRaw = { label: string; total: number; compliance_pct: number | null };

/** Para cada distribuidor, su cumplimiento por categoría (últimos 30d). N llamadas en paralelo. */
export async function loadHeatmap(
  supabase: DB,
  today: string,
  users: { id: string; name: string }[],
): Promise<Heatmap> {
  const start = addDays(today, -29);
  const capped = users.slice(0, HEATMAP_MAX_USERS);
  const per = await Promise.all(
    capped.map(async (u) => {
      const { data } = await supabase.rpc("compliance_breakdown", {
        d_start: start,
        d_end: today,
        dimension: "category",
        p_user: u.id,
        p_distribution: null,
      });
      const cells: Record<string, HeatCell> = {};
      for (const r of (data ?? []) as BreakdownRaw[]) cells[r.label] = { pct: r.compliance_pct ?? null, total: r.total ?? 0 };
      return { userId: u.id, name: u.name, cells };
    }),
  );
  const catSet = new Set<string>();
  for (const r of per) for (const k of Object.keys(r.cells)) catSet.add(k);
  return { categories: [...catSet].sort(), rows: per, truncated: Math.max(0, users.length - capped.length) };
}

// ── 4) Insights por reglas (citan el número) ──────────────────────────────────
export function buildDashboardInsights(dist: TeamDistribution, movers: Mover[], heatmap: Heatmap): Insight[] {
  const out: Insight[] = [];

  for (const o of dist.outliersLow) {
    out.push({ tone: "warn", text: `${o.name} está muy por debajo del equipo (${o.pct}% vs mediana ${dist.median}%).` });
  }
  const drop = movers.find((m) => m.delta <= -10);
  if (drop) out.push({ tone: "warn", text: `${drop.name} cayó ${Math.abs(drop.delta)} pts vs la semana previa (ahora ${drop.last}%).` });

  // categoría floja en TODO el equipo → problema de proceso, no de persona
  for (const cat of heatmap.categories) {
    const cells = heatmap.rows.map((r) => r.cells[cat]).filter((c) => c && c.pct != null) as HeatCell[];
    if (cells.length >= Math.max(2, Math.ceil(heatmap.rows.length / 2))) {
      const avg = Math.round(cells.reduce((s, c) => s + (c.pct as number), 0) / cells.length);
      if (avg < 60) out.push({ tone: "warn", text: `“${cat}” está floja en todo el equipo (promedio ${avg}%) — posible problema de proceso, no de persona.` });
    }
  }

  const rise = [...movers].sort((a, b) => b.delta - a.delta)[0];
  if (rise && rise.delta >= 10) out.push({ tone: "good", text: `${rise.name} subió ${rise.delta} pts vs la semana previa (ahora ${rise.last}%).` });

  if (out.length === 0) out.push({ tone: "info", text: "Equipo estable: sin outliers ni caídas marcadas esta semana." });
  return out;
}
