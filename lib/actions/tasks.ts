"use server";

// Server actions del motor de tareas. Bajo RLS con la SESIÓN del usuario (NUNCA service_role):
// la base de datos hace cumplir owner=self. Listados filtran deleted_at en la query (no en RLS).

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/server";
import { bogotaToday } from "@/lib/dashboard/week";
import { addDays } from "@/lib/tasks/dates";
import type { EditScope, StatusPct, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

type ActionResult = { ok: boolean; error?: string };

type CreateInput = {
  title: string;
  recurrence: TaskRecurrence;
  startDate: string; // YYYY-MM-DD
  timeSlot: string | null; // HH:MM
  durationMinutes?: number | null; // ADR-0011: bloque en la franja; null = punto
  priority: TaskPriority;
  categoryId?: string | null;
  weekdays?: number[] | null; // ADR-0019: días isodow 1=lun…7=dom; solo weekly (null/empty = legacy)
};

/** weekdays solo aplica a weekly y con al menos un día; el resto → null (legacy / no aplica). */
function normalizeWeekdays(recurrence: TaskRecurrence, weekdays?: number[] | null): number[] | null {
  if (recurrence !== "weekly") return null;
  return weekdays && weekdays.length > 0 ? weekdays : null;
}

type EditChanges = {
  title?: string;
  timeSlot?: string | null;
  priority?: TaskPriority;
  categoryId?: string | null;
  recurrence?: TaskRecurrence; // ADR-0019/nota2: editar recurrencia (incl. once→recurrente)
  weekdays?: number[] | null; // días isodow; solo aplica a weekly
  startDate?: string; // mover el día de una tarea "once" (scope all)
};

function minusOneDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function createTask(input: CreateInput): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const profile = await getProfile();
  if (profile.role !== "distributor" || !profile.distributionId) {
    return { ok: false, error: "Solo un distribuidor con distribución puede crear tareas." };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { error } = await supabase.from("tasks").insert({
    owner_user_id: user.id, // RLS exige owner=self
    distribution_id: profile.distributionId, // y distribution=current
    title: input.title,
    recurrence: input.recurrence,
    start_date: input.startDate,
    time_slot: input.timeSlot,
    duration_minutes: input.durationMinutes ?? null, // CHECK en DB: >0 y tope 22:00 (0004)
    priority: input.priority,
    category_id: input.categoryId ?? null,
    weekdays: normalizeWeekdays(input.recurrence, input.weekdays), // ADR-0019
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tareas"); // el trigger de alta materializa la instancia de hoy si due
  revalidatePath("/"); // refresca la lista de hoy del home (quick-add)
  return { ok: true };
}

export async function setStatus(taskId: string, date: string, pct: StatusPct): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  // ADR-0025: materialize-on-demand. La función DEFINER crea la instancia si falta y fija el estado de
  // forma atómica, con gate de propiedad en la DB → CUALQUIER tarea/día es calificable (no solo las que ya
  // tienen instancia). Reemplaza el UPDATE que fallaba en días futuros / huecos del cron.
  const { error } = await supabase.rpc("set_task_status", { p_task_id: taskId, p_date: date, p_pct: pct });
  if (error) return { ok: false, error: error.message };
  // Sin revalidatePath: el cliente reconcilia con router.refresh() (optimista). La otra ruta refleja en su
  // próxima navegación (pages dinámicas).
  return { ok: true };
}

/** Duplica una tarea con su forma (título "… (copia)"). RLS: el distribuidor sobre las SUYAS (owner=self);
 *  el admin sobre cualquiera (tasks_insert permite admin). El trigger materializa hoy si aplica. */
export async function duplicateTask(taskId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from("tasks")
    .select("owner_user_id, distribution_id, title, start_date, recurrence, recurrence_until, time_slot, duration_minutes, priority, category_id, weekdays")
    .eq("id", taskId)
    .maybeSingle();
  if (!t) return { ok: false, error: "Tarea no encontrada." };

  const { error } = await supabase.from("tasks").insert({
    owner_user_id: t.owner_user_id, // RLS: owner=self (distribuidor) o admin
    distribution_id: t.distribution_id,
    title: `${(t.title as string) ?? ""} (copia)`,
    start_date: t.start_date,
    recurrence: t.recurrence,
    recurrence_until: t.recurrence_until,
    time_slot: t.time_slot,
    duration_minutes: t.duration_minutes,
    priority: t.priority,
    category_id: t.category_id,
    weekdays: t.weekdays,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tareas");
  revalidatePath("/");
  return { ok: true };
}

export async function softDeleteTask(taskId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", taskId); // RLS: tasks_update self (hard-delete es admin-only)
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tareas");
  return { ok: true };
}

/**
 * Eliminar tarea (NOTA-1 ADR-0020), con scope. El distribuidor NO puede borrar task_instances (ti_delete es
 * admin-only), así que se usan herramientas que SÍ permite la RLS self (UPDATE de tasks):
 *  - all: soft-delete (deleted_at) → el loader oculta toda la serie.
 *  - this_day: añade la fecha a excluded_dates → el loader la oculta y la proyección la salta.
 *  - this_and_following: corta la serie (recurrence_until = date-1) + excluye los días YA materializados
 *    [date..hoy] (no se pueden borrar sus instances). El KPI excluye borradas/excluidas vía ADR-0021.
 */
export async function deleteTask(taskId: string, scope: EditScope, date: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();

  if (scope === "all") {
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId);
    if (error) return { ok: false, error: error.message };
  } else if (scope === "this_day") {
    const { data: t } = await supabase.from("tasks").select("excluded_dates").eq("id", taskId).maybeSingle();
    if (!t) return { ok: false, error: "Tarea no encontrada." };
    const excluded = Array.from(new Set([...(((t.excluded_dates as string[]) ?? [])), date]));
    const { error } = await supabase.from("tasks").update({ excluded_dates: excluded }).eq("id", taskId);
    if (error) return { ok: false, error: error.message };
  } else {
    // this_and_following
    const { data: t } = await supabase.from("tasks").select("excluded_dates").eq("id", taskId).maybeSingle();
    if (!t) return { ok: false, error: "Tarea no encontrada." };
    const today = bogotaToday();
    const range: string[] = [];
    for (let d = date; d <= today; d = addDays(d, 1)) range.push(d); // días ya materializados a ocultar
    const excluded = Array.from(new Set([...(((t.excluded_dates as string[]) ?? [])), ...range]));
    const { error } = await supabase
      .from("tasks")
      .update({ recurrence_until: minusOneDay(date), excluded_dates: excluded })
      .eq("id", taskId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/tareas");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Edición de recurrente, 3 scopes (ADR-0007). Todo con el client del usuario (RLS self).
 * ⚠ "this_and_following" y "this_day futuro" son varias sentencias secuenciales (no transaccionales;
 * un RPC atómico sería core). Estado recuperable si falla a mitad.
 */
export async function updateTask(
  taskId: string,
  scope: EditScope,
  date: string,
  changes: EditChanges,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();

  const taskPatch: Record<string, unknown> = {};
  if (changes.title !== undefined) taskPatch.title = changes.title;
  if (changes.timeSlot !== undefined) taskPatch.time_slot = changes.timeSlot;
  if (changes.priority !== undefined) taskPatch.priority = changes.priority;
  if (changes.categoryId !== undefined) taskPatch.category_id = changes.categoryId;

  if (scope === "all") {
    // recurrence/weekdays son de SERIE → van al patch de tasks (NUNCA al de this_day, que actualiza instances).
    const seriesPatch: Record<string, unknown> = { ...taskPatch };
    if (changes.recurrence !== undefined) {
      seriesPatch.recurrence = changes.recurrence;
      seriesPatch.weekdays = normalizeWeekdays(changes.recurrence, changes.weekdays);
    }
    // Mover el día de una tarea "once": cambia start_date y oculta el día viejo (excluded_dates) por si ya
    // se había materializado, para que no aparezca en dos fechas.
    if (changes.startDate !== undefined && changes.startDate !== date) {
      seriesPatch.start_date = changes.startDate;
      const { data: t } = await supabase.from("tasks").select("excluded_dates").eq("id", taskId).maybeSingle();
      seriesPatch.excluded_dates = Array.from(new Set([...(((t?.excluded_dates as string[]) ?? [])), date]));
    }
    const { error } = await supabase.from("tasks").update(seriesPatch).eq("id", taskId);
    if (error) return { ok: false, error: error.message };
  } else if (scope === "this_day") {
    const { data: inst } = await supabase
      .from("task_instances")
      .select("id")
      .eq("task_id", taskId)
      .eq("date", date)
      .maybeSingle();

    if (inst) {
      // Instancia existente (hoy/pasado) → override sobre la instancia.
      const { error } = await supabase.from("task_instances").update(taskPatch).eq("id", inst.id);
      if (error) return { ok: false, error: error.message };
    } else {
      // Futuro (sin instancia) → excluir el día de la serie + crear una tarea once con el contenido.
      const { data: t } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
      if (!t) return { ok: false, error: "Tarea no encontrada." };
      const excluded = [...(((t.excluded_dates as string[]) ?? [])), date];
      const e1 = await supabase.from("tasks").update({ excluded_dates: excluded }).eq("id", taskId);
      if (e1.error) return { ok: false, error: e1.error.message };
      const e2 = await supabase.from("tasks").insert({
        owner_user_id: t.owner_user_id,
        distribution_id: t.distribution_id,
        title: changes.title ?? t.title,
        recurrence: "once",
        start_date: date,
        time_slot: changes.timeSlot ?? t.time_slot,
        priority: changes.priority ?? t.priority,
        category_id: changes.categoryId ?? t.category_id,
      });
      if (e2.error) return { ok: false, error: e2.error.message };
    }
  } else {
    // this_and_following: corta la serie en date-1 + nueva serie desde date.
    const { data: t } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
    if (!t) return { ok: false, error: "Tarea no encontrada." };
    const e1 = await supabase.from("tasks").update({ recurrence_until: minusOneDay(date) }).eq("id", taskId);
    if (e1.error) return { ok: false, error: e1.error.message };
    // la NUEVA serie (desde date) nace con la recurrencia/días editados (o los de la serie original).
    const newRecurrence = (changes.recurrence ?? t.recurrence) as TaskRecurrence;
    const e2 = await supabase.from("tasks").insert({
      owner_user_id: t.owner_user_id,
      distribution_id: t.distribution_id,
      title: changes.title ?? t.title,
      recurrence: newRecurrence,
      start_date: date,
      time_slot: changes.timeSlot ?? t.time_slot,
      priority: changes.priority ?? t.priority,
      category_id: changes.categoryId ?? t.category_id,
      weekdays: normalizeWeekdays(newRecurrence, changes.weekdays ?? (t.weekdays as number[] | null)),
    });
    if (e2.error) return { ok: false, error: e2.error.message };
  }

  revalidatePath("/tareas");
  return { ok: true };
}
