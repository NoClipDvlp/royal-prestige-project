"use server";

// Server actions del motor de tareas. Bajo RLS con la SESIÓN del usuario (NUNCA service_role):
// la base de datos hace cumplir owner=self. Listados filtran deleted_at en la query (no en RLS).

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/server";
import type { EditScope, StatusPct, TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

type ActionResult = { ok: boolean; error?: string };

type CreateInput = {
  title: string;
  recurrence: TaskRecurrence;
  startDate: string; // YYYY-MM-DD
  timeSlot: string | null; // HH:MM
  priority: TaskPriority;
  categoryId?: string | null;
};

type EditChanges = {
  title?: string;
  timeSlot?: string | null;
  priority?: TaskPriority;
  categoryId?: string | null;
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
    priority: input.priority,
    category_id: input.categoryId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tareas"); // el trigger de alta materializa la instancia de hoy si due
  return { ok: true };
}

export async function setStatus(taskId: string, date: string, pct: StatusPct): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("task_instances")
    .update({ status_pct: pct, completed_at: pct === 100 ? new Date().toISOString() : null })
    .eq("task_id", taskId)
    .eq("date", date); // RLS: solo la propia instancia
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tareas");
  revalidatePath("/"); // la lista de hoy del home refleja el nuevo estado
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
    const { error } = await supabase.from("tasks").update(taskPatch).eq("id", taskId);
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
    const e2 = await supabase.from("tasks").insert({
      owner_user_id: t.owner_user_id,
      distribution_id: t.distribution_id,
      title: changes.title ?? t.title,
      recurrence: t.recurrence,
      start_date: date,
      time_slot: changes.timeSlot ?? t.time_slot,
      priority: changes.priority ?? t.priority,
      category_id: changes.categoryId ?? t.category_id,
    });
    if (e2.error) return { ok: false, error: e2.error.message };
  }

  revalidatePath("/tareas");
  return { ok: true };
}
