// Lectura de la vista premium BI (ADR-0030). NO-CORE: envuelve las funciones DEFINER ya mergeadas
// (task_load_forecast, compliance_breakdown extendido) — el gate de rol lo hace la DB. + insights por reglas.

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { bogotaToday } from "@/lib/dashboard/week";
import { addDays } from "@/lib/tasks/dates";

type DB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type LoadDimension = "distribution" | "distributor" | "category";
export type DrillDimension = "distribution" | "distributor" | "category" | "priority";
export type ForecastRow = { key: string; label: string; load: number };
export type DrillRow = { key: string; label: string; total: number; done: number; half: number; undone: number; pct: number | null };
export type ForecastWindow = "tomorrow" | "next7" | "next14";

/** Rango de la ventana de carga FUTURA (arranca mañana; tope ≤14 días, ADR-0030). */
export function forecastBounds(window: ForecastWindow, today = bogotaToday()): { dStart: string; dEnd: string } {
  const start = addDays(today, 1);
  if (window === "tomorrow") return { dStart: start, dEnd: start };
  return { dStart: start, dEnd: addDays(today, window === "next7" ? 7 : 14) };
}

export async function loadForecast(
  supabase: DB,
  p: { dStart: string; dEnd: string; dimension: LoadDimension; pUser?: string | null; pDistribution?: string | null },
): Promise<ForecastRow[]> {
  const { data, error } = await supabase.rpc("task_load_forecast", {
    d_start: p.dStart,
    d_end: p.dEnd,
    dimension: p.dimension,
    p_user: p.pUser ?? null,
    p_distribution: p.pDistribution ?? null,
  });
  if (error || !data) return [];
  return (data as ForecastRow[]).map((r) => ({ key: r.key, label: r.label, load: r.load ?? 0 }));
}

type DrillRaw = { key: string; label: string; total: number; done: number; half: number; undone: number; compliance_pct: number | null };

export async function loadComplianceDrill(
  supabase: DB,
  p: { dStart: string; dEnd: string; dimension: DrillDimension; pUser?: string | null; pDistribution?: string | null },
): Promise<DrillRow[]> {
  const { data, error } = await supabase.rpc("compliance_breakdown", {
    d_start: p.dStart,
    d_end: p.dEnd,
    dimension: p.dimension,
    p_user: p.pUser ?? null,
    p_distribution: p.pDistribution ?? null,
  });
  if (error || !data) return [];
  return (data as DrillRaw[]).map((r) => ({
    key: r.key,
    label: r.label,
    total: r.total ?? 0,
    done: r.done ?? 0,
    half: r.half ?? 0,
    undone: r.undone ?? 0,
    pct: r.compliance_pct ?? null,
  }));
}

export type Insight = { tone: "info" | "warn" | "good"; text: string };

/**
 * Insights por REGLAS (no LLM, ADR-0030 §2): outlier de carga vs la media + cumplimiento por umbral.
 * Cada frase CITA el número (umbrales conservadores; nada de adjetivos vacíos).
 */
export function buildInsights(forecastByDist: ForecastRow[], complianceByDist: DrillRow[]): Insight[] {
  const out: Insight[] = [];

  if (forecastByDist.length >= 2) {
    const total = forecastByDist.reduce((s, r) => s + r.load, 0);
    const avg = total / forecastByDist.length;
    const top = [...forecastByDist].sort((a, b) => b.load - a.load)[0];
    if (avg > 0 && top.load >= avg * 1.4) {
      const pct = Math.round((top.load / avg - 1) * 100);
      out.push({ tone: "warn", text: `${top.label} concentra ~${pct}% más carga que la media para la ventana (${top.load} vs ${avg.toFixed(0)} tareas).` });
    }
  }

  for (const d of complianceByDist) {
    if (d.pct == null || d.total < 5) continue;
    if (d.pct < 60) out.push({ tone: "warn", text: `${d.label} va en ${d.pct}% de cumplimiento (${d.total} tareas) — bajo el 60%.` });
    else if (d.pct >= 90) out.push({ tone: "good", text: `${d.label} sostiene ${d.pct}% de cumplimiento (${d.total} tareas).` });
  }

  if (out.length === 0) out.push({ tone: "info", text: "Sin señales destacadas: carga y cumplimiento dentro de lo esperado." });
  return out;
}
