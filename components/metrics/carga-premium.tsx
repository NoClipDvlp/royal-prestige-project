"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronRight, TrendingUp, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { addDays } from "@/lib/tasks/dates";
import { fetchForecast, fetchDrill } from "@/lib/bi/actions";
import { RC_REFRESH_EVENT } from "@/components/metrics/refresh-button";
import type { ForecastRow, DrillRow, Insight, LoadDimension, ForecastWindow } from "@/lib/bi/premium";

const WINDOWS: { key: ForecastWindow; label: string }[] = [
  { key: "tomorrow", label: "Mañana" },
  { key: "next7", label: "7 días" },
  { key: "next14", label: "14 días" },
];
const DIMS: { key: LoadDimension; label: string }[] = [
  { key: "distribution", label: "Distribución" },
  { key: "distributor", label: "Distribuidor" },
  { key: "category", label: "Categoría" },
];

const INSIGHT_TONE = {
  warn: { cls: "border-amber-500/30 bg-amber-500/10 text-amber-600", Icon: AlertTriangle },
  good: { cls: "border-positive/30 bg-positive/10 text-positive", Icon: CheckCircle2 },
  info: { cls: "border-white/40 bg-white/40 text-muted dark:bg-white/5", Icon: Info },
} as const;

function bounds(window: ForecastWindow, today: string) {
  const start = addDays(today, 1);
  if (window === "tomorrow") return { dStart: start, dEnd: start };
  return { dStart: start, dEnd: addDays(today, window === "next7" ? 7 : 14) };
}

type Level = "distribution" | "distributor" | "category";

export function CargaPremium({
  initialForecast,
  initialCompliance,
  insights,
  today,
}: {
  initialForecast: ForecastRow[];
  initialCompliance: DrillRow[];
  insights: Insight[];
  today: string;
}) {
  const [window, setWindow] = useState<ForecastWindow>("next7");
  const [dim, setDim] = useState<LoadDimension>("distribution");
  const [forecast, setForecast] = useState<ForecastRow[]>(initialForecast);
  const [pendingF, startF] = useTransition();

  const past = { dStart: addDays(today, -6), dEnd: today };
  const [trail, setTrail] = useState<{ label: string; level: Level; rows: DrillRow[] }[]>([
    { label: "Distribuciones", level: "distribution", rows: initialCompliance },
  ]);
  const [pendingD, startD] = useTransition();

  function applyForecast(w: ForecastWindow, d: LoadDimension) {
    setWindow(w);
    setDim(d);
    const b = bounds(w, today);
    startF(async () => setForecast(await fetchForecast({ ...b, dimension: d })));
  }

  // ADR-0031: este componente arranca de props del server (useState) → router.refresh no lo actualiza.
  // Al refrescar (RefreshButton dispara RC_REFRESH_EVENT) re-pide la carga actual y reinicia el drill al tope.
  // `globalThis` evita el shadow del state `window`.
  useEffect(() => {
    function onRefresh() {
      const b = bounds(window, today);
      startF(async () => setForecast(await fetchForecast({ ...b, dimension: dim })));
      startD(async () => {
        const rows = await fetchDrill({ ...past, dimension: "distribution" });
        setTrail([{ label: "Distribuciones", level: "distribution", rows }]);
      });
    }
    globalThis.addEventListener(RC_REFRESH_EVENT, onRefresh);
    return () => globalThis.removeEventListener(RC_REFRESH_EVENT, onRefresh);
  }, [window, dim, today, past.dStart, past.dEnd]);

  function drillInto(row: DrillRow) {
    const cur = trail[trail.length - 1];
    if (cur.level === "distribution") {
      startD(async () => {
        const rows = await fetchDrill({ ...past, dimension: "distributor", pDistribution: row.key });
        setTrail((t) => [...t, { label: row.label, level: "distributor", rows }]);
      });
    } else if (cur.level === "distributor") {
      startD(async () => {
        const rows = await fetchDrill({ ...past, dimension: "category", pUser: row.key });
        setTrail((t) => [...t, { label: row.label, level: "category", rows }]);
      });
    }
  }

  const maxLoad = Math.max(1, ...forecast.map((r) => r.load));
  const cur = trail[trail.length - 1];

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

      {/* Carga futura */}
      <GlassCard className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <TrendingUp size={15} /> Carga por venir
          </p>
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => applyForecast(w.key, dim)}
                className={`rounded-lg px-2 py-1 text-[11px] transition ${window === w.key ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3 flex gap-1">
          {DIMS.map((d) => (
            <button
              key={d.key}
              onClick={() => applyForecast(window, d.key)}
              className={`rounded-lg border px-2 py-0.5 text-[11px] transition ${dim === d.key ? "border-accent/40 bg-accent/15 text-accent" : "border-white/50 text-muted hover:text-fg dark:border-white/10"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {pendingF ? (
          <p className="py-6 text-center text-xs text-muted">Calculando…</p>
        ) : forecast.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">Sin tareas agendadas en la ventana.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {forecast.map((r) => (
              <li key={r.key} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs text-fg">{r.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(r.load / maxLoad) * 100}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">{r.load}</span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {/* Cumplimiento con drill */}
      <GlassCard className="p-4">
        <p className="mb-2 text-sm font-semibold text-fg">Cumplimiento (últimos 7 días) — drill</p>
        {/* breadcrumb del drill */}
        <div className="mb-3 flex flex-wrap items-center gap-1 text-[11px] text-muted">
          {trail.map((lvl, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={11} className="opacity-50" />}
              {i < trail.length - 1 ? (
                <button onClick={() => setTrail((t) => t.slice(0, i + 1))} className="transition hover:text-fg">
                  {lvl.label}
                </button>
              ) : (
                <span className="font-medium text-fg">{lvl.label}</span>
              )}
            </span>
          ))}
        </div>
        {pendingD ? (
          <p className="py-6 text-center text-xs text-muted">Cargando…</p>
        ) : cur.rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">Sin datos en este nivel.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {cur.rows.map((r) => {
              const drillable = cur.level !== "category";
              const Row = (
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-fg">{r.label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full ${r.pct != null && r.pct < 60 ? "bg-red-500" : r.pct != null && r.pct >= 90 ? "bg-positive" : "bg-accent"}`}
                      style={{ width: `${r.pct ?? 0}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted">
                    {r.pct ?? "—"}% · {r.total}
                  </span>
                </div>
              );
              return (
                <li key={r.key}>
                  {drillable ? (
                    <button onClick={() => drillInto(r)} className="w-full rounded-lg px-1 py-1 text-left transition hover:bg-white/30 dark:hover:bg-white/5">
                      <div className="flex items-center gap-1">
                        <div className="flex-1">{Row}</div>
                        <ChevronRight size={13} className="shrink-0 text-muted" />
                      </div>
                    </button>
                  ) : (
                    <div className="px-1 py-1">{Row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
