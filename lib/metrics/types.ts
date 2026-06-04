// Tipos del motor de métricas vivo (ADR-0012). La capa app consume las RPC compliance_self /
// compliance_ranking (0005) y mapea aquí. pct === null = "Sin datos" (NUNCA 0%).

export type ComplianceRange = "day" | "week" | "month";

export const RANGE_LABEL: Record<ComplianceRange, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
};

/** Agregado de cumplimiento de un rango (salida de compliance_self / por fila de ranking). */
export type ComplianceStat = {
  total: number;
  done: number;
  half: number;
  undone: number;
  pct: number | null; // null = sin datos en el rango
};

export const EMPTY_STAT: ComplianceStat = { total: 0, done: 0, half: 0, undone: 0, pct: null };

/** Los tres rangos precalculados (el cliente conmuta sin refetch). */
export type ComplianceByRange = Record<ComplianceRange, ComplianceStat>;

export type RankGrain = "user" | "distribution";

export const GRAIN_LABEL: Record<RankGrain, string> = {
  user: "Por distribuidor",
  distribution: "Por distribución",
};

/** Fila de ranking ya enriquecida con el nombre (vía users_labels / distributions). */
export type RankRow = ComplianceStat & {
  grain: RankGrain;
  id: string; // user_id (grain=user) o distribution_id (grain=distribution)
  name: string;
};

export type RankingByRange = Record<ComplianceRange, RankRow[]>;

// ── BI: tendencia (series) + desglose (breakdown) ──────────────────────────────

/** Punto de la serie temporal (denso: una entrada por bucket esperado; pct null = bucket sin datos). */
export type SeriesPoint = ComplianceStat & { bucketStart: string };
export type SeriesByBucket = Record<ComplianceRange, SeriesPoint[]>;

export type BreakdownDimension = "category" | "priority";

export const DIMENSION_LABEL: Record<BreakdownDimension, string> = {
  category: "Categoría",
  priority: "Prioridad",
};

export type BreakdownRow = ComplianceStat & { key: string; label: string };
export type BreakdownByDim = Record<BreakdownDimension, BreakdownRow[]>;
