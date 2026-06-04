import type { SeriesPoint } from "@/lib/metrics/types";

/**
 * Mini sparkline (SVG inline, sin ejes/labels) de la tendencia semanal del distribuidor en el ranking
 * (ADR-0014). Gap-aware: no une buckets sin datos (rompe el trazo). Destaca el último punto. Cero deps.
 */
export function Sparkline({ points }: { points: SeriesPoint[] }) {
  const withData = points.filter((p) => p.pct !== null);
  if (withData.length === 0) return <span className="text-[10px] text-muted/50">—</span>;

  const W = 64, H = 18, P = 2;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? W / 2 : P + (i / (n - 1)) * (W - 2 * P));
  const y = (v: number) => P + (1 - v / 100) * (H - 2 * P);

  const segs: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = points[i].pct;
    const b = points[i + 1].pct;
    if (a !== null && b !== null) segs.push(`M ${x(i).toFixed(1)} ${y(a).toFixed(1)} L ${x(i + 1).toFixed(1)} ${y(b).toFixed(1)}`);
  }
  let lastIdx = -1;
  points.forEach((p, i) => {
    if (p.pct !== null) lastIdx = i;
  });
  const lastPct = points[lastIdx].pct as number;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-5 w-16 shrink-0" role="img" aria-label="Tendencia semanal">
      {segs.map((d, i) => (
        <path key={i} d={d} fill="none" className="stroke-accent" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <circle cx={x(lastIdx)} cy={y(lastPct)} r={1.5} className="fill-accent" />
    </svg>
  );
}
