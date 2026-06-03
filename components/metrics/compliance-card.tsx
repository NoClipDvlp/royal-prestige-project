"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import {
  RANGE_LABEL,
  type ComplianceByRange,
  type ComplianceRange,
} from "@/lib/metrics/types";

const RANGE_OPTS = (["day", "week", "month"] as ComplianceRange[]).map((r) => ({
  value: r,
  label: RANGE_LABEL[r],
}));

/**
 * Tarjeta de cumplimiento propio (compliance_self) con toggle día/semana/mes — el cliente conmuta
 * en memoria (los 3 rangos vienen precalculados). pct null → "Sin datos" (nunca 0%). Vista compacta v1.
 */
export function ComplianceCard({
  data,
  defaultRange = "week",
}: {
  data: ComplianceByRange;
  defaultRange?: ComplianceRange;
}) {
  const [range, setRange] = useState<ComplianceRange>(defaultRange);
  const s = data[range];
  const hasData = s.pct !== null;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">Cumplimiento</p>
        <Segmented value={range} onChange={setRange} options={RANGE_OPTS} ariaLabel="Rango" />
      </div>

      <div className="mt-3">
        {hasData ? (
          <p className="text-3xl font-semibold text-fg">{s.pct}%</p>
        ) : (
          <p className="text-xl font-medium text-muted">Sin datos</p>
        )}
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${s.pct ?? 0}%` }} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <Count label="Hechas" value={s.done} />
        <Count label="A medias" value={s.half} />
        <Count label="Pendientes" value={s.undone} />
      </div>
    </GlassCard>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/40 py-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-xl font-semibold text-fg">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}
