"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { RANGE_LABEL, type ComplianceRange, type SeriesByBucket, type SeriesPoint } from "@/lib/metrics/types";

const RANGE_OPTS = (["day", "week", "month"] as ComplianceRange[]).map((r) => ({ value: r, label: RANGE_LABEL[r] }));

function fmtAxis(iso: string, bucket: ComplianceRange): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions =
    bucket === "month"
      ? { month: "short", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" };
  return new Intl.DateTimeFormat("es", opts).format(d).replace(".", "");
}

/**
 * Tendencia de cumplimiento (compliance_series) — SVG inline, sin dependencia de charts.
 * Toggle de bucket; el cliente conmuta entre las 3 series precalculadas. Los buckets sin datos (pct null)
 * NO se unen: el trazo se rompe en el hueco (no sugiere continuidad falsa). pct null → "Sin datos".
 */
export function TrendChart({ series }: { series: SeriesByBucket }) {
  const [bucket, setBucket] = useState<ComplianceRange>("week");
  const pts = series[bucket];
  const withData = pts.filter((p) => p.pct !== null);
  const last = withData.length ? withData[withData.length - 1] : null;

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Tendencia</p>
          {last ? (
            <p className="text-2xl font-semibold text-fg">
              {last.pct}%<span className="ml-1.5 text-xs font-normal text-muted">último</span>
            </p>
          ) : (
            <p className="text-base font-medium text-muted">Sin datos</p>
          )}
        </div>
        <Segmented value={bucket} onChange={setBucket} options={RANGE_OPTS} ariaLabel="Bucket de la tendencia" />
      </div>

      <div className="mt-4">
        {withData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Sin datos en el rango.</p>
        ) : (
          <Chart pts={pts} bucket={bucket} />
        )}
      </div>
    </GlassCard>
  );
}

function Chart({ pts, bucket }: { pts: SeriesPoint[]; bucket: ComplianceRange }) {
  const W = 100, H = 42, L = 5, R = 2, T = 3, B = 8;
  const pw = W - L - R, ph = H - T - B;
  const n = pts.length;
  const x = (i: number) => (n <= 1 ? L + pw / 2 : L + (i / (n - 1)) * pw);
  const y = (p: number) => T + (1 - p / 100) * ph;

  // Segmentos solo entre puntos consecutivos AMBOS con datos → la línea se rompe en los gaps.
  const segs: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i].pct, b = pts[i + 1].pct;
    if (a !== null && b !== null) segs.push(`M ${x(i).toFixed(2)} ${y(a).toFixed(2)} L ${x(i + 1).toFixed(2)} ${y(b).toFixed(2)}`);
  }
  const dots = pts.map((p, i) => (p.pct !== null ? { cx: x(i), cy: y(p.pct) } : null)).filter(Boolean) as { cx: number; cy: number }[];
  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label="Tendencia de cumplimiento ponderado">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="stroke-current text-muted/25" strokeWidth={0.2} />
          <text x={0} y={y(g) + 1} className="fill-current text-muted" fontSize={2.4}>{g}</text>
        </g>
      ))}
      {segs.map((d, i) => (
        <path key={i} d={d} fill="none" className="stroke-accent" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={0.95} className="fill-accent" />
      ))}
      {labelIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 1.5}
          textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          className="fill-current text-muted"
          fontSize={2.6}
        >
          {fmtAxis(pts[i].bucketStart, bucket)}
        </text>
      ))}
    </svg>
  );
}
