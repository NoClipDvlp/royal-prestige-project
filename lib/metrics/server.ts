// Lectura server-side del motor de métricas (ADR-0012). Trae los 3 rangos en paralelo; el cliente
// conmuta sin refetch. GRACEFUL: si la RPC 0005 aún no está aplicada en Supabase → error → "Sin datos"
// (pct null), sin crash (DEBT-0006: 0004/0005 los aplica Nicolas).

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { weekStartMonday } from "@/lib/dashboard/week";
import { monthStart } from "@/lib/tasks/dates";
import {
  EMPTY_STAT,
  type ComplianceByRange,
  type ComplianceRange,
  type ComplianceStat,
  type RankGrain,
  type RankRow,
  type RankingByRange,
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
