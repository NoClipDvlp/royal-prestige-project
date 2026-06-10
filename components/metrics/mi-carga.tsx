import { TrendingUp } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/card";
import { loadForecast, forecastBounds } from "@/lib/bi/premium";
import { bogotaToday } from "@/lib/dashboard/week";

// Carga futura del PROPIO distribuidor (ADR-0030 §4 / ADR-0031): su carga de mañana + próximos 7 días, por
// categoría. Reusa task_load_forecast (el gate de rol lo fuerza a su propia fila). Self-scope, sin ver a otros.
export async function MiCarga() {
  const supabase = await createSupabaseServerClient();
  const today = bogotaToday();
  const [manana, semana] = await Promise.all([
    loadForecast(supabase, { ...forecastBounds("tomorrow", today), dimension: "category" }),
    loadForecast(supabase, { ...forecastBounds("next7", today), dimension: "category" }),
  ]);
  const totManana = manana.reduce((s, r) => s + r.load, 0);
  const totSemana = semana.reduce((s, r) => s + r.load, 0);
  if (totSemana === 0) return null; // nada por venir → no ocupa espacio

  const maxCat = Math.max(1, ...semana.map((r) => r.load));
  return (
    <GlassCard className="p-3">
      <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] uppercase tracking-wide text-muted">
        <TrendingUp size={13} /> Mi carga por venir
      </p>
      <div className="mb-2 flex gap-4 px-1 text-sm">
        <span>
          <b className="text-fg">{totManana}</b> <span className="text-muted">mañana</span>
        </span>
        <span>
          <b className="text-fg">{totSemana}</b> <span className="text-muted">próx. 7 días</span>
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {semana.map((r) => (
          <li key={r.key} className="flex items-center gap-2 px-1">
            <span className="w-28 shrink-0 truncate text-xs text-fg">{r.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(r.load / maxCat) * 100}%` }} />
            </div>
            <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-muted">{r.load}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
