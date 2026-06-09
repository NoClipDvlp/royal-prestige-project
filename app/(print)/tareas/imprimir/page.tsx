// Vista de IMPRESIÓN del cronograma semanal (ADR print, no-core). Grupo (print) → sin shell de app.
// Imprime el PROPIO usuario su semana (RLS self). Hybrid: días ≤ hoy = instancias reales (con ✓ de estado),
// días futuros = proyección (tasks_due_on). El navegador da papel/escala/márgenes + "Guardar como PDF".

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, getProfile } from "@/lib/auth/server";
import { bogotaToday, weekStartMonday } from "@/lib/dashboard/week";
import { addDays, isValidIsoDate } from "@/lib/tasks/dates";
import { buildWeekMatrix } from "@/lib/tasks/print";
import { PrintSchedule } from "@/components/tasks/print-schedule";
import { PrintTrigger } from "@/components/tasks/print-trigger";
import type { DayItem, StatusPct, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

type DB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** 7 arreglos (lun…dom). Instancias reales para días ≤ hoy; proyección para días futuros. */
async function loadWeekItems(supabase: DB, weekStart: string, today: string): Promise<DayItem[][]> {
  const end = addDays(weekStart, 6);
  const { data } = await supabase
    .from("task_instances")
    .select(
      "task_id, date, status_pct, title, time_slot, duration_minutes, priority, tasks(title, time_slot, duration_minutes, priority, recurrence, weekdays, deleted_at, excluded_dates)",
    )
    .gte("date", weekStart)
    .lte("date", end);

  type TaskEmbed = {
    title: string | null; time_slot: string | null; duration_minutes: number | null; priority: string | null;
    recurrence: string | null; weekdays: number[] | null; deleted_at: string | null; excluded_dates: string[] | null;
  };
  type Row = {
    task_id: string; date: string; status_pct: number | null; title: string | null; time_slot: string | null;
    duration_minutes: number | null; priority: string | null; tasks: TaskEmbed | TaskEmbed[] | null;
  };

  const byDate = new Map<string, DayItem[]>();
  for (const raw of (data ?? []) as unknown as Row[]) {
    const t = (Array.isArray(raw.tasks) ? raw.tasks[0] : raw.tasks) ?? null;
    if (t?.deleted_at) continue; // oculta soft-deleted
    if (((t?.excluded_dates ?? []) as string[]).includes(String(raw.date))) continue; // y días excluidos
    const item: DayItem = {
      taskId: String(raw.task_id),
      date: String(raw.date),
      title: raw.title ?? t?.title ?? "",
      timeSlot: raw.time_slot ?? t?.time_slot ?? null,
      durationMinutes: raw.duration_minutes ?? t?.duration_minutes ?? null,
      priority: (raw.priority ?? t?.priority ?? "medium") as TaskPriority,
      recurrence: (t?.recurrence ?? "once") as TaskRecurrence,
      weekdays: t?.weekdays ?? null,
      status: (raw.status_pct ?? 0) as StatusPct,
    };
    const arr = byDate.get(item.date) ?? [];
    arr.push(item);
    byDate.set(item.date, arr);
  }

  type Proj = {
    id: string; title: string | null; time_slot: string | null; duration_minutes: number | null;
    priority: string | null; recurrence: string | null; weekdays: number[] | null;
  };
  const days: DayItem[][] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (d <= today) {
      days.push(byDate.get(d) ?? []);
    } else {
      const { data: proj } = await supabase.rpc("tasks_due_on", { d });
      days.push(
        ((proj ?? []) as unknown as Proj[]).map((p) => ({
          taskId: String(p.id),
          date: d,
          title: p.title ?? "",
          timeSlot: p.time_slot ?? null,
          durationMinutes: p.duration_minutes ?? null,
          priority: (p.priority ?? "medium") as TaskPriority,
          recurrence: (p.recurrence ?? "once") as TaskRecurrence,
          weekdays: p.weekdays ?? null,
          status: 0 as StatusPct, // futuro: sin instancia → sin estado
        })),
      );
    }
  }
  return days;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dnum = (iso: string): number => Number.parseInt(iso.slice(8, 10), 10);
const mIdx = (iso: string): number => Number.parseInt(iso.slice(5, 7), 10) - 1;
const yOf = (iso: string): string => iso.slice(0, 4);

export default async function ImprimirPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const profile = await getProfile();
  if (!profile.role) redirect("/sin-rol");

  const sp = await searchParams;
  const today = bogotaToday();
  const base = isValidIsoDate(sp?.d) ? sp.d : today;
  const weekStart = weekStartMonday(base);
  const weekEnd = addDays(weekStart, 6);

  const supabase = await createSupabaseServerClient();
  const days = await loadWeekItems(supabase, weekStart, today);
  const matrix = buildWeekMatrix(days);
  const dayNumbers = Array.from({ length: 7 }, (_, i) => dnum(addDays(weekStart, i)));

  const { data: me } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  let distName: string | null = null;
  if (profile.distributionId) {
    const { data: dist } = await supabase.from("distributions").select("name").eq("id", profile.distributionId).maybeSingle();
    distName = (dist?.name as string | undefined) ?? null;
  }
  const fullName = (me?.full_name as string | undefined) ?? user.email ?? "";

  const sameMonth = mIdx(weekStart) === mIdx(weekEnd);
  const rangeBase = sameMonth
    ? `Semana del ${dnum(weekStart)} al ${dnum(weekEnd)} de ${MESES[mIdx(weekEnd)]} de ${yOf(weekEnd)}`
    : `Semana del ${dnum(weekStart)} de ${MESES[mIdx(weekStart)]} al ${dnum(weekEnd)} de ${MESES[mIdx(weekEnd)]} de ${yOf(weekEnd)}`;
  const rangeLabel = [rangeBase, fullName, distName].filter(Boolean).join(" · ");
  const printedLabel = `Impreso el ${dnum(today)} de ${MESES[mIdx(today)]} de ${yOf(today)} · Royal Control · Pistacore`;

  return (
    <>
      <PrintSchedule
        matrix={matrix}
        dayNumbers={dayNumbers}
        title="Cronograma semanal"
        rangeLabel={rangeLabel}
        printedLabel={printedLabel}
      />
      <PrintTrigger />
    </>
  );
}
