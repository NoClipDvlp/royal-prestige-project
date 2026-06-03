import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { QuickAdd } from "@/components/tasks/quick-add";
import { DayView } from "@/components/tasks/day-view";
import type { DayItem, StatusPct, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

function bogotaToday(): string {
  // YYYY-MM-DD en America/Bogota (coincide con app_today() de la DB).
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export default async function TareasPage() {
  const today = bogotaToday();
  const supabase = await createSupabaseServerClient();

  // Instancias de hoy del usuario (RLS self) + contenido del task (coalesce override/task).
  const { data } = await supabase
    .from("task_instances")
    .select(
      "task_id, date, status_pct, title, time_slot, priority, tasks(title, time_slot, priority, recurrence, deleted_at)",
    )
    .eq("date", today);

  type TaskEmbed = {
    title: string | null;
    time_slot: string | null;
    priority: string | null;
    recurrence: string | null;
    deleted_at: string | null;
  };
  type Row = {
    task_id: string;
    date: string;
    status_pct: number | null;
    title: string | null;
    time_slot: string | null;
    priority: string | null;
    tasks: TaskEmbed | TaskEmbed[] | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  const items: DayItem[] = rows
    .map((r) => ({ r, t: (Array.isArray(r.tasks) ? r.tasks[0] : r.tasks) ?? null }))
    .filter(({ t }) => !t?.deleted_at) // filtrado de visualización (no en RLS): oculta soft-deleted
    .map(({ r, t }) => ({
      taskId: String(r.task_id),
      date: String(r.date),
      title: r.title ?? t?.title ?? "",
      timeSlot: r.time_slot ?? t?.time_slot ?? null,
      priority: (r.priority ?? t?.priority ?? "medium") as TaskPriority,
      recurrence: (t?.recurrence ?? "once") as TaskRecurrence,
      status: (r.status_pct ?? 0) as StatusPct,
    }));

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Tareas" subtitle="Tu día por franjas (8:00–22:00)." />
      <QuickAdd date={today} />
      <DayView items={items} date={today} />
    </div>
  );
}
