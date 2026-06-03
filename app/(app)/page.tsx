import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth/server";
import { DistributorDashboard } from "@/components/dashboard/distributor-dashboard";
import { GlassCard } from "@/components/ui/card";
import type { TaskCategory } from "@/components/tasks/task-create-modal";
import { bogotaToday, summarizeWeek, weekStartMonday, type WeekRow } from "@/lib/dashboard/week";
import type { DayItem, StatusPct, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

// "/" = DISPATCHER por rol (ADR-0009). El distribuidor ve su dashboard real; admin/auditor se enrutan.
export default async function Home() {
  const { role } = await getProfile();
  if (role === null) redirect("/sin-rol");
  if (role === "admin") redirect("/admin");
  if (role === "auditor") redirect("/metricas");
  // distributor (jd/seller futuros caen aquí pero la RLS los limita)

  // El shell hace stream de inmediato; los datos del dashboard llegan dentro del Suspense.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DistributorData />
    </Suspense>
  );
}

async function DistributorData() {
  const supabase = await createSupabaseServerClient();
  const user = await getUser();
  const name = (user?.user_metadata?.full_name as string | undefined) ?? "—";

  const today = bogotaToday();
  const weekStart = weekStartMonday(today);

  // Tres lecturas en paralelo (RLS self): semana transcurrida + tareas de hoy + categorías del modal.
  const [weekRes, todayRes, catRes] = await Promise.all([
    supabase
      .from("task_instances")
      .select("status_pct, date, priority, tasks(priority)")
      .gte("date", weekStart)
      .lte("date", today),
    supabase
      .from("task_instances")
      .select(
        "task_id, date, status_pct, title, time_slot, duration_minutes, priority, tasks(title, time_slot, duration_minutes, priority, recurrence, deleted_at)",
      )
      .eq("date", today),
    supabase.from("task_categories").select("id, name").order("name"),
  ]);

  type EmbedTask = { priority: TaskPriority | null };
  type Raw = {
    status_pct: number | null;
    date: string;
    priority: TaskPriority | null;
    tasks: EmbedTask | EmbedTask[] | null;
  };

  const rows: WeekRow[] = ((weekRes.data ?? []) as unknown as Raw[]).map((r) => ({
    status_pct: r.status_pct,
    date: r.date,
    priority: r.priority,
    taskPriority: (Array.isArray(r.tasks) ? r.tasks[0]?.priority : r.tasks?.priority) ?? null,
  }));

  const summary = summarizeWeek(rows);
  const pendingToday = rows.filter((r) => r.date === today && (r.status_pct ?? 0) < 100).length;

  type TaskEmbed = {
    title: string | null;
    time_slot: string | null;
    duration_minutes: number | null;
    priority: string | null;
    recurrence: string | null;
    deleted_at: string | null;
  };
  type TodayRaw = {
    task_id: string;
    date: string;
    status_pct: number | null;
    title: string | null;
    time_slot: string | null;
    duration_minutes: number | null;
    priority: string | null;
    tasks: TaskEmbed | TaskEmbed[] | null;
  };

  const todayItems: DayItem[] = ((todayRes.data ?? []) as unknown as TodayRaw[])
    .map((r) => ({ r, t: (Array.isArray(r.tasks) ? r.tasks[0] : r.tasks) ?? null }))
    .filter(({ t }) => !t?.deleted_at) // oculta soft-deleted (filtrado de visualización, no RLS)
    .map(({ r, t }) => ({
      taskId: String(r.task_id),
      date: String(r.date),
      title: r.title ?? t?.title ?? "",
      timeSlot: r.time_slot ?? t?.time_slot ?? null,
      durationMinutes: r.duration_minutes ?? t?.duration_minutes ?? null,
      priority: (r.priority ?? t?.priority ?? "medium") as TaskPriority,
      recurrence: (t?.recurrence ?? "once") as TaskRecurrence,
      status: (r.status_pct ?? 0) as StatusPct,
    }));

  const categories = (catRes.data ?? []) as TaskCategory[];

  return (
    <DistributorDashboard
      name={name}
      summary={summary}
      pendingToday={pendingToday}
      today={todayItems}
      date={today}
      categories={categories}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <GlassCard className="h-36 animate-pulse" />
      <div className="grid grid-cols-3 gap-5">
        <GlassCard className="h-28 animate-pulse" />
        <GlassCard className="h-28 animate-pulse" />
        <GlassCard className="h-28 animate-pulse" />
      </div>
      <GlassCard className="h-48 animate-pulse" />
    </div>
  );
}
