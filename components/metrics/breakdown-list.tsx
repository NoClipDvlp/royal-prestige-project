"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { PRIORITY_LABEL, type TaskPriority } from "@/lib/tasks/types";
import {
  DIMENSION_LABEL,
  type BreakdownByDim,
  type BreakdownDimension,
  type BreakdownRow,
} from "@/lib/metrics/types";

const DIM_OPTS = (["category", "priority"] as BreakdownDimension[]).map((d) => ({ value: d, label: DIMENSION_LABEL[d] }));

function sortRows(rows: BreakdownRow[]): BreakdownRow[] {
  return [...rows].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}

/**
 * Desglose del perfil (compliance_breakdown) — "¿en qué falla ahora?" sobre los últimos 30 días.
 * Toggle de dimensión (categoría/prioridad); lista con barra + pct + counts. Cero títulos (ADR-0005).
 * La prioridad se localiza en cliente; la categoría usa el nombre que da la RPC.
 */
export function BreakdownList({ data }: { data: BreakdownByDim }) {
  const [dim, setDim] = useState<BreakdownDimension>("category");
  const rows = sortRows(data[dim]);

  return (
    <GlassCard className="p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Desglose</p>
          <p className="text-[11px] text-muted/70">Últimos 30 días</p>
        </div>
        <Segmented value={dim} onChange={setDim} options={DIM_OPTS} ariaLabel="Dimensión del desglose" />
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Sin datos en el rango.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const label = dim === "priority" ? PRIORITY_LABEL[r.key as TaskPriority] ?? r.label : r.label;
            return (
              <div key={`${dim}-${r.key}`} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-fg">{label}</span>
                    <span className={cn("shrink-0 text-xs font-semibold tabular-nums", r.pct === null ? "text-muted" : "text-fg")}>
                      {r.pct === null ? "Sin datos" : `${r.pct}%`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${r.pct ?? 0}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-muted">
                    {r.done}✓ · {r.half}◑ · {r.undone}○
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
