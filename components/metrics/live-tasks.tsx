import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/card";
import { bogotaToday } from "@/lib/dashboard/week";
import { RECURRENCE_LABEL, type TaskRecurrence } from "@/lib/tasks/types";

// Vista VIVA de las tareas del distribuidor para supervisores (gap de ADR-0031): el estado REAL actual
// (tasks + task_instances vivos), no la definición de la plantilla. SOLO ADMIN: el auditor no puede leer
// títulos de tareas (frontera PII de ADR-0005/0013 — ve agregados). El admin sí (RLS tasks_select admin).
export async function LiveTasks({ userId, canSeeDetail }: { userId: string; canSeeDetail: boolean }) {
  if (!canSeeDetail) {
    return (
      <GlassCard className="p-4 text-xs text-muted">
        El detalle por tarea es solo para admin. Los auditores ven agregados (cumplimiento / carga) por la
        frontera de privacidad — sin títulos individuales.
      </GlassCard>
    );
  }

  const supabase = await createSupabaseServerClient();
  const today = bogotaToday();
  const [{ data: tasks }, { data: insts }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, time_slot, recurrence")
      .eq("owner_user_id", userId)
      .is("deleted_at", null)
      .order("time_slot", { nullsFirst: false }),
    supabase.from("task_instances").select("task_id, status_pct").eq("owner_user_id", userId).eq("date", today),
  ]);

  const statusByTask = new Map((insts ?? []).map((i) => [i.task_id as string, i.status_pct as number]));
  const rows = (tasks ?? []) as { id: string; title: string; time_slot: string | null; recurrence: TaskRecurrence }[];

  return (
    <GlassCard className="p-0">
      <div className="border-b border-white/40 px-4 py-2.5 dark:border-white/10">
        <p className="text-sm font-semibold text-fg">Tareas vivas del distribuidor</p>
        <p className="text-[11px] text-muted">Estado real actual ({rows.length}) — refleja ediciones/borrados, no la plantilla.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted">Este distribuidor no tiene tareas vivas.</p>
      ) : (
        <ul className="divide-y divide-white/30 dark:divide-white/10">
          {rows.map((t) => {
            const st = statusByTask.get(t.id);
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-12 shrink-0 text-[11px] tabular-nums text-muted">{t.time_slot ? t.time_slot.slice(0, 5) : "—"}</span>
                <span className="flex-1 truncate text-sm text-fg">{t.title}</span>
                <span className="shrink-0 text-[11px] text-muted">{RECURRENCE_LABEL[t.recurrence]}</span>
                <span
                  className={`w-12 shrink-0 text-right text-[11px] font-medium ${
                    st === 100 ? "text-positive" : st === 50 ? "text-amber-600" : st === 0 ? "text-red-500" : "text-muted"
                  }`}
                >
                  {st == null ? "—" : `${st}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
