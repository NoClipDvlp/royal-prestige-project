import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { BoardSkeleton, SkeletonCard } from "@/components/skeletons";
import { RefreshButton } from "@/components/metrics/refresh-button";
import { ComplianceCard } from "@/components/metrics/compliance-card";
import { DayNav } from "@/components/tasks/day-nav";
import { TareasBoard } from "@/components/tasks/tareas-board";
import type { TaskCategory } from "@/components/tasks/task-create-modal";
import { complianceByRanges } from "@/lib/metrics/server";
import { bogotaToday } from "@/lib/dashboard/week";
import { isValidIsoDate } from "@/lib/tasks/dates";
import type { DayItem, StatusPct, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

type DB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Categorías visibles (RLS: globales + personales propias). Para el selector del modal. */
async function loadCategories(supabase: DB): Promise<TaskCategory[]> {
  const { data } = await supabase.from("task_categories").select("id, name").order("name");
  return (data ?? []) as TaskCategory[];
}

/** Pasado/hoy: instancias reales del usuario (RLS self), contenido efectivo (coalesce override/task). */
async function loadInstances(supabase: DB, date: string): Promise<DayItem[]> {
  const { data } = await supabase
    .from("task_instances")
    .select(
      "task_id, date, status_pct, title, time_slot, duration_minutes, priority, tasks(title, time_slot, duration_minutes, priority, recurrence, weekdays, deleted_at)",
    )
    .eq("date", date);

  type TaskEmbed = {
    title: string | null;
    time_slot: string | null;
    duration_minutes: number | null;
    priority: string | null;
    recurrence: string | null;
    weekdays: number[] | null;
    deleted_at: string | null;
  };
  type Row = {
    task_id: string;
    date: string;
    status_pct: number | null;
    title: string | null;
    time_slot: string | null;
    duration_minutes: number | null;
    priority: string | null;
    tasks: TaskEmbed | TaskEmbed[] | null;
  };

  return ((data ?? []) as unknown as Row[])
    .map((r) => ({ r, t: (Array.isArray(r.tasks) ? r.tasks[0] : r.tasks) ?? null }))
    .filter(({ t }) => !t?.deleted_at) // filtrado de visualización (no en RLS): oculta soft-deleted
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

/** Futuro: proyección read-only vía RPC tasks_due_on (SECURITY INVOKER, respeta RLS self; ADR-0011). */
async function loadProjection(supabase: DB, date: string): Promise<DayItem[]> {
  const { data } = await supabase.rpc("tasks_due_on", { d: date });

  type TaskRow = {
    id: string;
    title: string | null;
    time_slot: string | null;
    duration_minutes: number | null;
    priority: string | null;
    recurrence: string | null;
    weekdays: number[] | null;
  };

  return ((data ?? []) as unknown as TaskRow[]).map((t) => ({
    taskId: String(t.id),
    date,
    title: t.title ?? "",
    timeSlot: t.time_slot ?? null,
    durationMinutes: t.duration_minutes ?? null,
    priority: (t.priority ?? "medium") as TaskPriority,
    recurrence: (t.recurrence ?? "once") as TaskRecurrence,
    weekdays: t.weekdays ?? null,
    status: 0 as StatusPct, // el futuro no tiene instancia materializada → sin estado
  }));
}

async function TareasData({ date, editable }: { date: string; editable: boolean }) {
  const supabase = await createSupabaseServerClient();
  const [items, categories] = await Promise.all([
    editable ? loadInstances(supabase, date) : loadProjection(supabase, date),
    loadCategories(supabase),
  ]);
  return <TareasBoard items={items} date={date} editable={editable} categories={categories} />;
}

// Cumplimiento del usuario (movido del home, #9 QA Tanda 2). Streamea aparte para no bloquear el shell.
async function TareasCompliance() {
  const supabase = await createSupabaseServerClient();
  const compliance = await complianceByRanges(supabase, bogotaToday());
  return <ComplianceCard data={compliance} defaultRange="week" />;
}

export default async function TareasPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const sp = await searchParams;
  const today = bogotaToday();
  const date = isValidIsoDate(sp?.d) ? sp.d : today;
  const editable = date <= today; // ISO se ordena lexicográficamente

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <PageTitle
          title="Tareas"
          subtitle="Tu día por franjas (8:00–22:00). Arrastra sobre una franja para crear."
        />
        <RefreshButton label="Refrescar" />
      </div>
      <Suspense fallback={<SkeletonCard className="h-44" />}>
        <TareasCompliance />
      </Suspense>
      <DayNav date={date} today={today} />
      <Suspense key={date} fallback={<BoardSkeleton />}>
        <TareasData date={date} editable={editable} />
      </Suspense>
    </div>
  );
}
