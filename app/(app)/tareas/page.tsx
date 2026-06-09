import { Suspense } from "react";
import { CheckCircle2, CalendarClock, Printer } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { GlassCard } from "@/components/ui/card";
import { BoardSkeleton, SkeletonCard } from "@/components/skeletons";
import { RefreshButton } from "@/components/metrics/refresh-button";
import { ComplianceCard } from "@/components/metrics/compliance-card";
import { DayNav } from "@/components/tasks/day-nav";
import { TareasBoard } from "@/components/tasks/tareas-board";
import type { TaskCategory } from "@/components/tasks/task-create-modal";
import { complianceByRanges } from "@/lib/metrics/server";
import { bogotaToday } from "@/lib/dashboard/week";
import { addDays, isValidIsoDate } from "@/lib/tasks/dates";
import type { DayItem, StatusPct, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_DOT: Record<TaskPriority, string> = { high: "bg-red-500", medium: "bg-accent", low: "bg-muted/60" };

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
      "task_id, date, status_pct, title, time_slot, duration_minutes, priority, tasks(title, time_slot, duration_minutes, priority, recurrence, weekdays, deleted_at, excluded_dates)",
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
    excluded_dates: string[] | null;
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
    // filtrado de visualización (no RLS): oculta soft-deleted y los días excluidos (borrar "solo este día")
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

/** Futuro: proyección vía RPC tasks_due_on (SECURITY INVOKER, RLS self; ADR-0011) + overlay del estado de
 *  instancias YA materializadas ese día (ADR-0025: marcar a futuro crea la instancia → debe reflejarse). */
async function loadProjection(supabase: DB, date: string): Promise<DayItem[]> {
  const [{ data }, { data: ins }] = await Promise.all([
    supabase.rpc("tasks_due_on", { d: date }),
    supabase.from("task_instances").select("task_id, status_pct").eq("date", date),
  ]);
  const statusByTask = new Map(
    ((ins ?? []) as { task_id: string; status_pct: number | null }[]).map((r) => [String(r.task_id), (r.status_pct ?? 0) as StatusPct]),
  );

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
    status: statusByTask.get(String(t.id)) ?? (0 as StatusPct), // ADR-0025: refleja lo marcado a futuro
  }));
}

async function TareasData({
  date,
  isToday,
  hasInstances,
}: {
  date: string;
  isToday: boolean;
  hasInstances: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  // hasInstances (hoy/pasado): instancias reales con estado. Futuro: proyección (sin instancia, sin estado).
  const [items, categories] = await Promise.all([
    hasInstances ? loadInstances(supabase, date) : loadProjection(supabase, date),
    loadCategories(supabase),
  ]);

  // UX "Estás al día": viendo HOY y sin nada pendiente (todo al 100% o sin tareas).
  const pending = items.filter((it) => (it.status ?? 0) < 100).length;
  const alDia = isToday && pending === 0;

  return (
    <>
      {alDia && (
        <div className="flex items-center gap-2 rounded-2xl border border-positive/30 bg-positive/10 px-3 py-2.5 text-sm font-medium text-positive">
          <CheckCircle2 size={16} /> Estás al día. {items.length === 0 ? "No tienes tareas para hoy." : "Completaste todo lo de hoy."}
        </div>
      )}
      {/* ADR-0025: CUALQUIER tarea/día es calificable (set_task_status materializa on-demand). */}
      <TareasBoard items={items} date={date} canMarkStatus categories={categories} />
    </>
  );
}

/** Look-ahead de mañana, ordenado por prioridad (alta→baja). Read-only; ayuda a anticipar el día siguiente. */
async function TomorrowPreview({ today }: { today: string }) {
  const supabase = await createSupabaseServerClient();
  const items = await loadProjection(supabase, addDays(today, 1));
  if (items.length === 0) return null;
  const sorted = [...items].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.timeSlot ?? "~").localeCompare(b.timeSlot ?? "~"),
  );
  return (
    <GlassCard className="p-3">
      <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] uppercase tracking-wide text-muted">
        <CalendarClock size={13} /> Tareas para mañana · por prioridad
      </p>
      <ul className="flex flex-col gap-1">
        {sorted.map((it) => (
          <li key={it.taskId} className="flex items-center gap-2 rounded-lg px-2 py-1">
            <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[it.priority]}`} aria-hidden />
            <span className="flex-1 truncate text-sm text-fg">{it.title}</span>
            {it.timeSlot && <span className="shrink-0 text-[11px] text-muted">{it.timeSlot.slice(0, 5)}</span>}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
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
  const isToday = date === today;
  const hasInstances = date <= today; // ISO ordena lexicográficamente; solo hoy/pasado tienen instancia

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <PageTitle
          title="Tareas"
          subtitle="Tu día por franjas (8:00–22:00). Arrastra sobre una franja para crear."
        />
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`/tareas/imprimir?d=${date}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl glass elev-1 px-3 py-1.5 text-xs font-medium text-fg transition hover:opacity-90"
          >
            <Printer size={14} /> Imprimir cronograma
          </a>
          <RefreshButton label="Refrescar" />
        </div>
      </div>
      <Suspense fallback={<SkeletonCard className="h-44" />}>
        <TareasCompliance />
      </Suspense>
      <DayNav date={date} today={today} />
      <Suspense key={date} fallback={<BoardSkeleton />}>
        <TareasData date={date} isToday={isToday} hasInstances={hasInstances} />
      </Suspense>
      {isToday && (
        <Suspense fallback={<SkeletonCard className="h-24" />}>
          <TomorrowPreview today={today} />
        </Suspense>
      )}
    </div>
  );
}
