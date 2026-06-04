"use server";

// Server actions de PLANTILLAS (Fase 2a, ADR-0015) — CRUD bajo la SESIÓN del admin (RLS admin de 0008;
// sin service_role). Plantilla = soft-delete (deleted_at); item = hard-delete (definición pura; el SET NULL
// de 0008 deja vivas las tareas ya materializadas → KPI intacto). SIN asignar/propagar/customized_at (Fase 2b).

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/server";
import type { TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

type Result = { ok: boolean; error?: string };

export type TemplateItemInput = {
  title: string;
  categoryId?: string | null;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  timeSlot?: string | null; // HH:MM
  durationMinutes?: number | null;
};

async function requireAdmin(): Promise<Result | null> {
  const profile = await getProfile();
  if (profile.role !== "admin") return { ok: false, error: "Operación restringida a admin." };
  return null;
}

export async function createTemplate(name: string, description: string | null): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  const { error } = await supabase.from("task_templates").insert({ name, description, created_by: user.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateTemplate(
  id: string,
  changes: { name?: string; description?: string | null },
): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) patch.name = changes.name;
  if (changes.description !== undefined) patch.description = changes.description;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("task_templates").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function softDeleteTemplate(id: string): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("task_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function createTemplateItem(templateId: string, item: TemplateItemInput): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("template_items").insert({
    template_id: templateId,
    title: item.title,
    category_id: item.categoryId ?? null,
    priority: item.priority,
    recurrence: item.recurrence,
    time_slot: item.timeSlot ?? null,
    duration_minutes: item.durationMinutes ?? null, // CHECK en DB (0008): >0 y tope 22:00
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateTemplateItem(id: string, changes: Partial<TemplateItemInput>): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const patch: Record<string, unknown> = {};
  if (changes.title !== undefined) patch.title = changes.title;
  if (changes.categoryId !== undefined) patch.category_id = changes.categoryId;
  if (changes.priority !== undefined) patch.priority = changes.priority;
  if (changes.recurrence !== undefined) patch.recurrence = changes.recurrence;
  if (changes.timeSlot !== undefined) patch.time_slot = changes.timeSlot;
  if (changes.durationMinutes !== undefined) patch.duration_minutes = changes.durationMinutes;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("template_items").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Hard-delete del item (gestión libre; ADR-0015 §5 — el SET NULL de 0008 deja vivas las tareas ya materializadas). */
export async function deleteTemplateItem(id: string): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("template_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
