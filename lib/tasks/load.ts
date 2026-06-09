// Carga de tareas por día (fuente única; antes duplicado en /tareas y en la vista de impresión).
// - loadDayInstances: instancias reales (≤hoy) con coalesce override→task; oculta borradas + días excluidos.
// - loadDayProjection: proyección (tasks_due_on) + overlay del estado de instancias ya materializadas
//   (ADR-0025: marcar a futuro crea la instancia → debe reflejarse).
// - loadDayForPrint: ≤hoy = instancias, futuro = proyección (hybrid del print).

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DayItem, StatusPct, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

type DB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const INST_SELECT =
  "task_id, date, status_pct, title, time_slot, duration_minutes, priority, tasks(title, time_slot, duration_minutes, priority, recurrence, weekdays, deleted_at, excluded_dates)";

type TaskEmbed = {
  title: string | null; time_slot: string | null; duration_minutes: number | null; priority: string | null;
  recurrence: string | null; weekdays: number[] | null; deleted_at: string | null; excluded_dates: string[] | null;
};
type InstRow = {
  task_id: string; date: string; status_pct: number | null; title: string | null; time_slot: string | null;
  duration_minutes: number | null; priority: string | null; tasks: TaskEmbed | TaskEmbed[] | null;
};
type ProjRow = {
  id: string; title: string | null; time_slot: string | null; duration_minutes: number | null;
  priority: string | null; recurrence: string | null; weekdays: number[] | null;
};

/** Instancias reales del día (≤hoy): coalesce override/task; oculta soft-deleted + días excluidos. */
export async function loadDayInstances(supabase: DB, date: string): Promise<DayItem[]> {
  const { data } = await supabase.from("task_instances").select(INST_SELECT).eq("date", date);
  return ((data ?? []) as unknown as InstRow[])
    .map((r) => ({ r, t: (Array.isArray(r.tasks) ? r.tasks[0] : r.tasks) ?? null }))
    .filter(({ r, t }) => !t?.deleted_at && !((t?.excluded_dates ?? []) as string[]).includes(String(r.date)))
    .map(({ r, t }) => ({
      taskId: String(r.task_id),
      date: String(r.date),
      title: r.title ?? t?.title ?? "",
      timeSlot: r.time_slot ?? t?.time_slot ?? null,
      durationMinutes: r.duration_minutes ?? t?.duration_minutes ?? null,
      priority: (r.priority ?? t?.priority ?? "medium") as TaskPriority,
      recurrence: (t?.recurrence ?? "once") as TaskRecurrence,
      weekdays: t?.weekdays ?? null,
      status: (r.status_pct ?? 0) as StatusPct,
    }));
}

/** Proyección del día (tasks_due_on) + overlay del estado de instancias ya materializadas (ADR-0025). */
export async function loadDayProjection(supabase: DB, date: string): Promise<DayItem[]> {
  const [{ data }, { data: ins }] = await Promise.all([
    supabase.rpc("tasks_due_on", { d: date }),
    supabase.from("task_instances").select("task_id, status_pct").eq("date", date),
  ]);
  const statusByTask = new Map(
    ((ins ?? []) as { task_id: string; status_pct: number | null }[]).map((r) => [String(r.task_id), (r.status_pct ?? 0) as StatusPct]),
  );
  return ((data ?? []) as unknown as ProjRow[]).map((p) => ({
    taskId: String(p.id),
    date,
    title: p.title ?? "",
    timeSlot: p.time_slot ?? null,
    durationMinutes: p.duration_minutes ?? null,
    priority: (p.priority ?? "medium") as TaskPriority,
    recurrence: (p.recurrence ?? "once") as TaskRecurrence,
    weekdays: p.weekdays ?? null,
    status: statusByTask.get(String(p.id)) ?? (0 as StatusPct),
  }));
}

/** Hybrid del día: instancias reales si ≤hoy; proyección si futuro. */
export const loadDayForPrint = (supabase: DB, date: string, today: string): Promise<DayItem[]> =>
  date <= today ? loadDayInstances(supabase, date) : loadDayProjection(supabase, date);
