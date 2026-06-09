// Vista de IMPRESIÓN del cronograma del usuario (ADR print, no-core). Grupo (print) → sin shell de app.
// Imprime el PROPIO usuario (RLS self) su SEMANA o un DÍA (?view=day). Hybrid: días ≤ hoy = instancias reales
// (con ✓), futuros = proyección (tasks_due_on). El navegador da papel/escala/márgenes + "Guardar como PDF".

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, getProfile } from "@/lib/auth/server";
import { bogotaToday, weekStartMonday } from "@/lib/dashboard/week";
import { addDays, isValidIsoDate } from "@/lib/tasks/dates";
import { DOW, dayNum, isoDow, longDay, printedLabel, weekRange } from "@/lib/tasks/print-format";
import { PrintSchedule, type PrintColumn } from "@/components/tasks/print-schedule";
import { PrintStylePanel } from "@/components/tasks/print-style-panel";
import type { DayItem, StatusPct, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

type DB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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

const INST_SELECT =
  "task_id, date, status_pct, title, time_slot, duration_minutes, priority, tasks(title, time_slot, duration_minutes, priority, recurrence, weekdays, deleted_at, excluded_dates)";

/** Instancias reales del día (≤hoy): coalesce override/task; oculta borradas + días excluidos. */
async function loadDayInstances(supabase: DB, date: string): Promise<DayItem[]> {
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

/** Proyección del día (futuro): tasks_due_on (sin estado). */
async function loadDayProjection(supabase: DB, date: string): Promise<DayItem[]> {
  const { data } = await supabase.rpc("tasks_due_on", { d: date });
  return ((data ?? []) as unknown as ProjRow[]).map((p) => ({
    taskId: String(p.id),
    date,
    title: p.title ?? "",
    timeSlot: p.time_slot ?? null,
    durationMinutes: p.duration_minutes ?? null,
    priority: (p.priority ?? "medium") as TaskPriority,
    recurrence: (p.recurrence ?? "once") as TaskRecurrence,
    weekdays: p.weekdays ?? null,
    status: 0 as StatusPct,
  }));
}

const loadDayForPrint = (supabase: DB, date: string, today: string): Promise<DayItem[]> =>
  date <= today ? loadDayInstances(supabase, date) : loadDayProjection(supabase, date);

export default async function ImprimirPage({ searchParams }: { searchParams: Promise<{ d?: string; view?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const profile = await getProfile();
  if (!profile.role) redirect("/sin-rol");

  const sp = await searchParams;
  const view = sp?.view === "day" ? "day" : "week";
  const today = bogotaToday();
  const base = isValidIsoDate(sp?.d) ? sp.d : today;

  const supabase = await createSupabaseServerClient();
  const { data: me } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  let distName: string | null = null;
  if (profile.distributionId) {
    const { data: dist } = await supabase.from("distributions").select("name").eq("id", profile.distributionId).maybeSingle();
    distName = (dist?.name as string | undefined) ?? null;
  }
  const fullName = (me?.full_name as string | undefined) ?? user.email ?? "";
  const printed = printedLabel(today);

  let days: DayItem[][];
  let columns: PrintColumn[];
  let title: string;
  let rangeLabel: string;

  if (view === "day") {
    const wd = isoDow(base);
    days = [await loadDayForPrint(supabase, base, today)];
    columns = [{ dow: DOW[wd], dnum: dayNum(base), weekend: wd >= 5 }];
    title = "Cronograma del día";
    rangeLabel = [longDay(base), fullName, distName].filter(Boolean).join(" · ");
  } else {
    const weekStart = weekStartMonday(base);
    const weekEnd = addDays(weekStart, 6);
    days = await Promise.all(Array.from({ length: 7 }, (_, i) => loadDayForPrint(supabase, addDays(weekStart, i), today)));
    columns = Array.from({ length: 7 }, (_, i) => ({ dow: DOW[i], dnum: dayNum(addDays(weekStart, i)), weekend: i >= 5 }));
    title = "Cronograma semanal";
    rangeLabel = [weekRange(weekStart, weekEnd), fullName, distName].filter(Boolean).join(" · ");
  }

  const dq = `d=${base}`;
  const viewHrefs = { weekHref: `/tareas/imprimir?${dq}`, dayHref: `/tareas/imprimir?${dq}&view=day`, current: view as "week" | "day" };

  return (
    <>
      <PrintSchedule days={days} columns={columns} title={title} rangeLabel={rangeLabel} printedLabel={printed} />
      <PrintStylePanel viewHrefs={viewHrefs} />
    </>
  );
}
