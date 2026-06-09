"use server";

// Server actions de PLANTILLAS (Fase 2a, ADR-0015) — CRUD bajo la SESIÓN del admin (RLS admin de 0008;
// sin service_role). Plantilla = soft-delete (deleted_at); item = hard-delete (definición pura; el SET NULL
// de 0008 deja vivas las tareas ya materializadas → KPI intacto). SIN asignar/propagar/customized_at (Fase 2b).

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/server";
import { bogotaToday } from "@/lib/dashboard/week";
import type { TaskPriority, TaskRecurrence } from "@/lib/tasks/types";

type Result = { ok: boolean; error?: string };

export type AssignWarning = { userId: string; kind: "duplicate" | "overlap"; detail: string };

export type TemplateItemInput = {
  title: string;
  categoryId?: string | null;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  timeSlot?: string | null; // HH:MM
  durationMinutes?: number | null;
  weekdays?: number[] | null; // ADR-0019: días isodow 1=lun…7=dom; solo weekly
  emoji?: string | null; // ADR-0024: emoji del ítem (se muestra en el cronograma impreso de plantilla)
};

/** weekdays para weekly (multi-día, recurrencia) y para once (día puntual en el cronograma de plantilla,
 *  print-only — NO altera el motor: una once materializa por su start_date, ignora weekdays). El resto → null. */
function tplWeekdays(recurrence: TaskRecurrence, weekdays?: number[] | null): number[] | null {
  if (recurrence !== "weekly" && recurrence !== "once") return null;
  return weekdays && weekdays.length > 0 ? weekdays : null;
}

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
    weekdays: tplWeekdays(item.recurrence, item.weekdays), // ADR-0019
    emoji: item.emoji ?? null, // ADR-0024
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
  if (changes.emoji !== undefined) patch.emoji = changes.emoji; // ADR-0024
  // ADR-0019: si llega recurrence (el form manda payload completo), normaliza weekdays por ella.
  if (changes.recurrence !== undefined) patch.weekdays = tplWeekdays(changes.recurrence, changes.weekdays);
  else if (changes.weekdays !== undefined) patch.weekdays = changes.weekdays;
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
  // Simetría de la siembra (ADR-0018): al quitar el ítem, RETIRA (soft-delete) las tareas que sembró y que el
  // distribuidor NO editó (customized_at IS NULL). Las customizadas se RESPETAN (son suyas). ANTES del
  // hard-delete: el FK ON DELETE SET NULL desvincularía template_item_id si borráramos el ítem primero.
  const { error: de } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("template_item_id", id)
    .is("customized_at", null)
    .is("deleted_at", null);
  if (de) return { ok: false, error: de.message };
  const { error } = await supabase.from("template_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Duplica una plantilla COMPLETA (cabecera + todos sus ítems) con nombre "… (copia)". Admin. */
export async function duplicateTemplate(id: string): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { data: tpl } = await supabase.from("task_templates").select("name, description").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!tpl) return { ok: false, error: "Plantilla no encontrada." };

  const { data: created, error: ce } = await supabase
    .from("task_templates")
    .insert({ name: `${tpl.name as string} (copia)`, description: (tpl.description as string | null) ?? null, created_by: user.id })
    .select("id")
    .single();
  if (ce || !created) return { ok: false, error: ce?.message ?? "No se pudo duplicar la plantilla." };

  const { data: items } = await supabase
    .from("template_items")
    .select("title, category_id, priority, recurrence, time_slot, duration_minutes, weekdays, emoji")
    .eq("template_id", id);
  if (items && items.length > 0) {
    const rows = (items as Record<string, unknown>[]).map((it) => ({ ...it, template_id: created.id as string }));
    const { error: ie } = await supabase.from("template_items").insert(rows);
    if (ie) return { ok: false, error: ie.message };
  }
  revalidatePath("/admin");
  return { ok: true };
}

// ── Fase 2b: asignación (reusa el motor; ⚠ atomicidad del bulk = DEBT-0007, no transaccional) ──

type ItemRow = {
  id: string;
  title: string;
  category_id: string | null;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  time_slot: string | null;
  duration_minutes: number | null;
  weekdays: number[] | null;
};

/**
 * Asigna la plantilla a los distribuidores dados que NO estén ya activos (evita duplicar): por cada item
 * → INSERT en tasks (origin='superior', assigned_by, template_id/item_id, start_date=hoy) reusando el motor
 * (el trigger materializa la instancia de hoy). + upsert template_assignments(active=true). Re-asignar tras
 * unassign crea tareas FRESCAS (las viejas quedan archivadas). ⚠ 2 sentencias no transaccionales (DEBT-0007).
 */
export async function assignTemplate(templateId: string, userIds: string[]): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (userIds.length === 0) return { ok: true };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin) return { ok: false, error: "No autenticado." };

  const { data: itemsData, error: ie } = await supabase
    .from("template_items")
    .select("id, title, category_id, priority, recurrence, time_slot, duration_minutes, weekdays")
    .eq("template_id", templateId);
  if (ie) return { ok: false, error: ie.message };
  const items = (itemsData ?? []) as ItemRow[];

  const { data: usersData } = await supabase.from("users").select("id, distribution_id, role").in("id", userIds);
  const { data: activeRows } = await supabase
    .from("template_assignments")
    .select("user_id")
    .eq("template_id", templateId)
    .eq("active", true);
  const activeSet = new Set(((activeRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const targets = ((usersData ?? []) as { id: string; distribution_id: string | null; role: string }[]).filter(
    (u) => u.role === "distributor" && u.distribution_id && !activeSet.has(u.id),
  );
  if (targets.length === 0) return { ok: true };

  const today = bogotaToday();
  const taskRows = targets.flatMap((u) =>
    items.map((it) => ({
      owner_user_id: u.id,
      distribution_id: u.distribution_id,
      title: it.title,
      category_id: it.category_id,
      priority: it.priority,
      recurrence: it.recurrence,
      start_date: today,
      time_slot: it.time_slot,
      duration_minutes: it.duration_minutes,
      weekdays: it.weekdays,
      origin: "superior",
      assigned_by_user_id: admin.id,
      template_id: templateId,
      template_item_id: it.id,
    })),
  );
  if (taskRows.length) {
    const { error } = await supabase.from("tasks").insert(taskRows);
    if (error) return { ok: false, error: error.message };
  }
  const { error: ae } = await supabase
    .from("template_assignments")
    .upsert(
      targets.map((u) => ({ template_id: templateId, user_id: u.id, assigned_by: admin.id, active: true })),
      { onConflict: "template_id,user_id" },
    );
  if (ae) return { ok: false, error: ae.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Asignar a TODOS los distribuidores (opt-in: la UI pregunta). */
export async function assignToAll(templateId: string): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("users").select("id").eq("role", "distributor");
  return assignTemplate(templateId, ((data ?? []) as { id: string }[]).map((d) => d.id));
}

/** SOFT-DETACH: soft-delete (deleted_at) de las tareas de esa plantilla para ese user + active=false.
 *  Conserva las instancias pasadas (KPI intacto, ADR-0007). ⚠ 2 sentencias no transaccionales (DEBT-0007). */
export async function unassignTemplate(templateId: string, userId: string): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const { error: te } = await supabase
    .from("tasks")
    .update({ deleted_at: nowIso })
    .eq("template_id", templateId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);
  if (te) return { ok: false, error: te.message };
  const { error: ae } = await supabase
    .from("template_assignments")
    .update({ active: false })
    .eq("template_id", templateId)
    .eq("user_id", userId);
  if (ae) return { ok: false, error: ae.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Advertencias ADVISORY (read-only) de las nuevas asignaciones: duplicado + solape. No bloquea. */
export async function previewTemplateAssignment(
  templateId: string,
  userIds: string[],
): Promise<{ ok: boolean; warnings?: AssignWarning[]; error?: string }> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied.error };
  if (userIds.length === 0) return { ok: true, warnings: [] };
  const supabase = await createSupabaseServerClient();
  const { data: items } = await supabase
    .from("template_items")
    .select("title, time_slot, recurrence, duration_minutes")
    .eq("template_id", templateId);
  const { data: tasks } = await supabase
    .from("tasks")
    .select("owner_user_id, title, time_slot, recurrence, duration_minutes")
    .in("owner_user_id", userIds)
    .is("deleted_at", null);

  type TItem = { title: string; time_slot: string | null; recurrence: string; duration_minutes: number | null };
  type TTask = TItem & { owner_user_id: string };
  const mins = (ts: string | null) => (ts ? Number.parseInt(ts.slice(0, 2), 10) * 60 + Number.parseInt(ts.slice(3, 5), 10) : null);
  const warnings: AssignWarning[] = [];

  for (const uid of userIds) {
    const userTasks = ((tasks ?? []) as TTask[]).filter((t) => t.owner_user_id === uid);
    for (const it of (items ?? []) as TItem[]) {
      if (userTasks.some((t) => t.title === it.title && t.time_slot === it.time_slot && t.recurrence === it.recurrence)) {
        warnings.push({ userId: uid, kind: "duplicate", detail: `"${it.title}" ya existe (${it.time_slot ?? "sin hora"})` });
        continue;
      }
      const is = mins(it.time_slot);
      if (is == null) continue;
      const ieEnd = is + (it.duration_minutes ?? 60);
      const clash = userTasks.find((t) => {
        const ts = mins(t.time_slot);
        if (ts == null) return false;
        return is < ts + (t.duration_minutes ?? 60) && ts < ieEnd;
      });
      if (clash) warnings.push({ userId: uid, kind: "overlap", detail: `"${it.title}" (${it.time_slot}) solapa con "${clash.title}"` });
    }
  }
  return { ok: true, warnings };
}

// ── Fase 2c: propagación no-destructiva al editar la plantilla (ADR-0016) ──

/**
 * Aplica la definición ACTUAL de cada item de la plantilla a las tareas vinculadas que el distribuidor NO
 * editó (customized_at IS NULL), vivas (deleted_at IS NULL) y de asignados ACTIVOS. NUNCA toca task_instances
 * (KPI/overrides intactos por coalesce). Idempotente. "Solo futuras" = no llamar a esto (no-op).
 * ⚠ N updates (uno por item) no transaccionales (DEBT-0007); re-ejecutable sin daño.
 */
export async function propagateTemplate(templateId: string): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin) return { ok: false, error: "No autenticado." };

  const { data: itemsData } = await supabase
    .from("template_items")
    .select("id, title, category_id, priority, recurrence, time_slot, duration_minutes, weekdays")
    .eq("template_id", templateId);
  const items = (itemsData ?? []) as ItemRow[];
  if (items.length === 0) return { ok: true };
  const { data: act } = await supabase
    .from("template_assignments")
    .select("user_id")
    .eq("template_id", templateId)
    .eq("active", true);
  const userIds = ((act ?? []) as { user_id: string }[]).map((a) => a.user_id);
  if (userIds.length === 0) return { ok: true };

  // 1) UPDATE de campos de items EXISTENTES — respeta lo editado por el distribuidor (customized_at, trigger
  //    0010) y los borrados; solo asignados activos.
  for (const it of items) {
    const { error } = await supabase
      .from("tasks")
      .update({
        title: it.title,
        category_id: it.category_id,
        priority: it.priority,
        recurrence: it.recurrence,
        time_slot: it.time_slot,
        duration_minutes: it.duration_minutes,
        weekdays: it.weekdays,
      })
      .eq("template_item_id", it.id)
      .is("customized_at", null)
      .is("deleted_at", null)
      .in("owner_user_id", userIds);
    if (error) return { ok: false, error: error.message };
  }

  // 2) SIEMBRA de items NUEVOS (ADR-0018, revierte el diferido de ADR-0015 §5): inserta las tareas que un
  //    asignado activo aún NO tiene (patrón de assignTemplate, reusa el motor → el trigger materializa hoy).
  //    Idempotente: dedup por (owner, template_item_id) sobre TODAS las tareas del template (incl. borradas)
  //    → no duplica ni resucita lo que el distribuidor quitó. start_date = hoy (no retroactivo).
  const { data: usersData } = await supabase
    .from("users")
    .select("id, distribution_id, role")
    .in("id", userIds);
  const owners = ((usersData ?? []) as { id: string; distribution_id: string | null; role: string }[]).filter(
    (u) => u.role === "distributor" && u.distribution_id,
  );

  const { data: existing } = await supabase
    .from("tasks")
    .select("owner_user_id, template_item_id")
    .eq("template_id", templateId)
    .in("owner_user_id", userIds)
    .not("template_item_id", "is", null);
  const present = new Set(
    ((existing ?? []) as { owner_user_id: string; template_item_id: string }[]).map(
      (r) => `${r.owner_user_id}:${r.template_item_id}`,
    ),
  );

  const today = bogotaToday();
  const seedRows = owners.flatMap((u) =>
    items
      .filter((it) => !present.has(`${u.id}:${it.id}`))
      .map((it) => ({
        owner_user_id: u.id,
        distribution_id: u.distribution_id,
        title: it.title,
        category_id: it.category_id,
        priority: it.priority,
        recurrence: it.recurrence,
        start_date: today,
        time_slot: it.time_slot,
        duration_minutes: it.duration_minutes,
        origin: "superior",
        assigned_by_user_id: admin.id,
        template_id: templateId,
        template_item_id: it.id,
      })),
  );
  if (seedRows.length) {
    const { error } = await supabase.from("tasks").insert(seedRows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin");
  return { ok: true };
}

/** Cuenta las tareas vivas vinculadas a un item — para avisar antes de hard-borrarlo (SET NULL desvincula). */
export async function countItemLinkedTasks(itemId: string): Promise<{ ok: boolean; count?: number; error?: string }> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied.error };
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("template_item_id", itemId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}
