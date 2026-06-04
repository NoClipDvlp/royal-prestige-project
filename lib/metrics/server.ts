// Lectura server-side del motor de métricas (ADR-0012). Trae los 3 rangos en paralelo; el cliente
// conmuta sin refetch. GRACEFUL: si la RPC 0005 aún no está aplicada en Supabase → error → "Sin datos"
// (pct null), sin crash (DEBT-0006: 0004/0005 los aplica Nicolas).

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { weekStartMonday } from "@/lib/dashboard/week";
import { addDays, addMonths, monthStart } from "@/lib/tasks/dates";
import {
  EMPTY_STAT,
  type BreakdownByDim,
  type BreakdownDimension,
  type BreakdownRow,
  type ComplianceByRange,
  type ComplianceRange,
  type ComplianceStat,
  type RankGrain,
  type RankRow,
  type RankingByRange,
  type SeriesByBucket,
  type SeriesPoint,
} from "@/lib/metrics/types";

type DB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** [d_start, d_end] por rango. d_end = hoy (la función SQL capa a app_today()). */
function bounds(today: string): Record<ComplianceRange, [string, string]> {
  return {
    day: [today, today],
    week: [weekStartMonday(today), today],
    month: [monthStart(today), today],
  };
}

type SelfRow = { total: number; done: number; half: number; undone: number; compliance_pct: number | null };

async function self(supabase: DB, dStart: string, dEnd: string): Promise<ComplianceStat> {
  const { data, error } = await supabase.rpc("compliance_self", { d_start: dStart, d_end: dEnd });
  const row = (data as SelfRow[] | null)?.[0];
  if (error || !row) return EMPTY_STAT;
  return {
    total: row.total ?? 0,
    done: row.done ?? 0,
    half: row.half ?? 0,
    undone: row.undone ?? 0,
    pct: row.compliance_pct ?? null,
  };
}

/** KPI propio (compliance_self) para los 3 rangos. INVOKER → RLS self. */
export async function complianceByRanges(supabase: DB, today: string): Promise<ComplianceByRange> {
  const b = bounds(today);
  const [day, week, month] = await Promise.all([
    self(supabase, ...b.day),
    self(supabase, ...b.week),
    self(supabase, ...b.month),
  ]);
  return { day, week, month };
}

type RankRaw = {
  grain: RankGrain;
  user_id: string | null;
  distribution_id: string | null;
  total: number;
  done: number;
  half: number;
  undone: number;
  compliance_pct: number | null;
};

async function rankRows(
  supabase: DB,
  dStart: string,
  dEnd: string,
  nameByUser: Map<string, string>,
  nameByDist: Map<string, string>,
): Promise<RankRow[]> {
  const { data, error } = await supabase.rpc("compliance_ranking", { d_start: dStart, d_end: dEnd });
  if (error || !data) return [];
  return (data as RankRaw[]).map((r) => {
    const id = (r.grain === "user" ? r.user_id : r.distribution_id) ?? "";
    const name =
      r.grain === "user" ? nameByUser.get(id) ?? "—" : nameByDist.get(id) ?? "—";
    return {
      grain: r.grain,
      id,
      name,
      total: r.total ?? 0,
      done: r.done ?? 0,
      half: r.half ?? 0,
      undone: r.undone ?? 0,
      pct: r.compliance_pct ?? null,
    };
  });
}

/** Ranking (compliance_ranking) para los 3 rangos, con nombres (users_labels / distributions). */
export async function rankingByRanges(supabase: DB, today: string): Promise<RankingByRange> {
  const b = bounds(today);
  const [labelsRes, distsRes] = await Promise.all([
    supabase.from("users_labels").select("id, full_name"),
    supabase.from("distributions").select("id, name"),
  ]);
  const nameByUser = new Map<string, string>(
    ((labelsRes.data ?? []) as { id: string; full_name: string | null }[]).map((u) => [u.id, u.full_name ?? "—"]),
  );
  const nameByDist = new Map<string, string>(
    ((distsRes.data ?? []) as { id: string; name: string | null }[]).map((d) => [d.id, d.name ?? "—"]),
  );

  const [day, week, month] = await Promise.all([
    rankRows(supabase, ...b.day, nameByUser, nameByDist),
    rankRows(supabase, ...b.week, nameByUser, nameByDist),
    rankRows(supabase, ...b.month, nameByUser, nameByDist),
  ]);
  return { day, week, month };
}

// ── BI: perfil de un distribuidor (tendencia + desglose) ───────────────────────

/** Nombre del distribuidor + su distribución (users_labels / distributions; auditor-safe). */
export async function fetchLabel(
  supabase: DB,
  userId: string,
): Promise<{ name: string; distributionName: string | null }> {
  const { data: lab } = await supabase
    .from("users_labels")
    .select("full_name, distribution_id")
    .eq("id", userId)
    .maybeSingle();
  const label = lab as { full_name: string | null; distribution_id: string | null } | null;
  let distributionName: string | null = null;
  if (label?.distribution_id) {
    const { data: d } = await supabase
      .from("distributions")
      .select("name")
      .eq("id", label.distribution_id)
      .maybeSingle();
    distributionName = (d as { name: string | null } | null)?.name ?? null;
  }
  return { name: label?.full_name ?? "—", distributionName };
}

type SeriesRow = { bucket_start: string; total: number; done: number; half: number; undone: number; compliance_pct: number | null };

/** Secuencia esperada de buckets (alineada) en [start, today] para densificar la serie (gaps = pct null). */
function expectedBuckets(bucket: ComplianceRange, start: string, today: string): string[] {
  const out: string[] = [];
  if (bucket === "day") {
    for (let d = start; d <= today; d = addDays(d, 1)) out.push(d);
  } else if (bucket === "week") {
    for (let d = weekStartMonday(start); d <= today; d = addDays(d, 7)) out.push(d);
  } else {
    for (let d = monthStart(start); d <= today; d = monthStart(addMonths(d, 1))) out.push(d);
  }
  return out;
}

async function seriesOne(supabase: DB, userId: string, bucket: ComplianceRange, start: string, today: string): Promise<SeriesPoint[]> {
  const { data, error } = await supabase.rpc("compliance_series", {
    d_start: start,
    d_end: today,
    bucket,
    p_user: userId,
  });
  const byStart = new Map<string, SeriesRow>(
    error ? [] : ((data ?? []) as SeriesRow[]).map((r) => [r.bucket_start, r]),
  );
  return expectedBuckets(bucket, start, today).map((bs) => {
    const r = byStart.get(bs);
    return r
      ? { bucketStart: bs, total: r.total ?? 0, done: r.done ?? 0, half: r.half ?? 0, undone: r.undone ?? 0, pct: r.compliance_pct ?? null }
      : { bucketStart: bs, ...EMPTY_STAT };
  });
}

/** Tendencia: serie densa por bucket (día=últimos 30d; semana=últimas 12 sem; mes=últimos 12 meses). */
export async function seriesByBuckets(supabase: DB, userId: string, today: string): Promise<SeriesByBucket> {
  const [day, week, month] = await Promise.all([
    seriesOne(supabase, userId, "day", addDays(today, -29), today),
    seriesOne(supabase, userId, "week", weekStartMonday(addDays(today, -7 * 11)), today),
    seriesOne(supabase, userId, "month", addMonths(monthStart(today), -11), today),
  ]);
  return { day, week, month };
}

type BreakdownRaw = { key: string; label: string; total: number; done: number; half: number; undone: number; compliance_pct: number | null };

async function breakdownOne(supabase: DB, userId: string, dimension: BreakdownDimension, start: string, today: string): Promise<BreakdownRow[]> {
  const { data, error } = await supabase.rpc("compliance_breakdown", {
    d_start: start,
    d_end: today,
    dimension,
    p_user: userId,
  });
  if (error || !data) return [];
  return (data as BreakdownRaw[]).map((r) => ({
    key: r.key,
    label: r.label,
    total: r.total ?? 0,
    done: r.done ?? 0,
    half: r.half ?? 0,
    undone: r.undone ?? 0,
    pct: r.compliance_pct ?? null,
  }));
}

/** Desglose: categoría + prioridad sobre los últimos 30 días ("¿en qué falla ahora?"). */
export async function breakdownByDims(supabase: DB, userId: string, today: string): Promise<BreakdownByDim> {
  const start = addDays(today, -29);
  const [category, priority] = await Promise.all([
    breakdownOne(supabase, userId, "category", start, today),
    breakdownOne(supabase, userId, "priority", start, today),
  ]);
  return { category, priority };
}
