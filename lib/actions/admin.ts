"use server";

// Server actions del panel admin. DOS modos:
//  • Asignaciones (rol/distribución/nombre/distribuciones/categorías): con la SESIÓN del admin (RLS admin +
//    el trigger permite porque app_current_role()='admin') → SIN service_role → esquiva DEBT-0010.
//  • Alta/reset de usuarios (API GoTrue): service_role GATEADO por assertCallerIsAdmin().

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertCallerIsAdmin, getProfile, type AppRole } from "@/lib/auth/server";
import { createSupabaseAdminClient, createSupabasePasswordProbeClient } from "@/lib/supabase/admin";

type Result = { ok: boolean; error?: string };

/** Fila de tarea de un usuario, para la vista READ-ONLY del admin. */
export type AdminTaskRow = {
  taskId: string;
  date: string;
  title: string;
  timeSlot: string | null;
  status: number;
};

async function requireAdminOrError(): Promise<Result | null> {
  const profile = await getProfile();
  if (profile.role !== "admin") return { ok: false, error: "Operación restringida a admin." };
  return null;
}

/** Asignar rol + distribución con la sesión del admin. Respeta CHECK rol↔distribución. */
export async function assignUserRole(
  userId: string,
  role: AppRole | null,
  distributionId: string | null,
): Promise<Result> {
  const denied = await requireAdminOrError();
  if (denied) return denied;

  const needsDist = role === "distributor" || role === "jd" || role === "seller";
  const dist = needsDist ? distributionId : null; // admin/auditor/null ⇒ distribución null
  if (needsDist && !dist) return { ok: false, error: "Un distribuidor requiere una distribución." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("users").update({ role, distribution_id: dist }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Editar el nombre de un usuario (admin edita rol/distribución/nombre/foto, NO email). */
export async function updateUserName(userId: string, fullName: string): Promise<Result> {
  const denied = await requireAdminOrError();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("users").update({ full_name: fullName }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function createDistribution(name: string): Promise<Result> {
  const denied = await requireAdminOrError();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("distributions").insert({ name });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function createGlobalCategory(name: string, color: string | null): Promise<Result> {
  const denied = await requireAdminOrError();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  // cat_insert exige scope='global', owner_user_id null, created_by = auth.uid()
  const { error } = await supabase
    .from("task_categories")
    .insert({ name, color, scope: "global", owner_user_id: null, created_by: user.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Crear usuario con contraseña TEMPORAL (sin invitación por email — DEBT-0008). service_role GATEADO. */
export async function adminCreateUser(
  email: string,
  tempPassword: string,
  fullName: string,
): Promise<Result> {
  try {
    await assertCallerIsAdmin(); // ⚠ gate ANTES de tocar service_role
  } catch {
    return { ok: false, error: "Operación restringida a admin." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true, // sin SMTP: lo confirmamos para que pueda entrar (DEBT-0008)
    user_metadata: { full_name: fullName },
  });
  if (error) return { ok: false, error: error.message };
  // El trigger handle_new_user crea el perfil role=null; el admin asigna rol con su sesión.
  revalidatePath("/admin");
  return { ok: true };
}

/** Reset de contraseña por el admin (fija una temporal). service_role GATEADO. */
export async function adminResetPassword(userId: string, newPassword: string): Promise<Result> {
  try {
    await assertCallerIsAdmin();
  } catch {
    return { ok: false, error: "Operación restringida a admin." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Listar (READ-ONLY) las tareas de un usuario. Con la SESIÓN del admin: la RLS `ti_select` permite
 * que el admin lea todas las instancias. Solo lectura — editar tareas de otros está DIFERIDO.
 * ⚠ Solo aparecen las instancias materializadas (el motor materializa "hoy"; histórico = días ya
 * materializados). Devuelve las más recientes primero.
 */
export async function adminListUserTasks(
  userId: string,
): Promise<{ ok: boolean; error?: string; tasks?: AdminTaskRow[] }> {
  try {
    await assertCallerIsAdmin();
  } catch {
    return { ok: false, error: "Operación restringida a admin." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_instances")
    .select("task_id, date, status_pct, title, time_slot, tasks(title, time_slot, deleted_at)")
    .eq("owner_user_id", userId)
    .order("date", { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };

  type Embed = { title: string | null; time_slot: string | null; deleted_at: string | null };
  type Raw = {
    task_id: string;
    date: string;
    status_pct: number | null;
    title: string | null;
    time_slot: string | null;
    tasks: Embed | Embed[] | null;
  };

  const tasks: AdminTaskRow[] = ((data ?? []) as unknown as Raw[])
    .map((r) => ({ r, t: (Array.isArray(r.tasks) ? r.tasks[0] : r.tasks) ?? null }))
    .filter(({ t }) => !t?.deleted_at)
    .map(({ r, t }) => ({
      taskId: String(r.task_id),
      date: String(r.date),
      title: r.title ?? t?.title ?? "",
      timeSlot: r.time_slot ?? t?.time_slot ?? null,
      status: r.status_pct ?? 0,
    }));
  return { ok: true, tasks };
}

/**
 * Eliminar usuario (DESTRUCTIVO, hard-delete). Exige:
 *   1) ser admin (assertCallerIsAdmin),
 *   2) NO ser uno mismo (self-guard),
 *   3) RE-AUTENTICACIÓN por contraseña del admin con un cliente desechable (no toca su sesión).
 * Solo tras la re-auth se usa service_role: auth.admin.deleteUser → ON DELETE CASCADE borra el
 * perfil, tareas, instancias y métricas del usuario. Irreversible.
 */
export async function adminDeleteUser(targetUserId: string, adminPassword: string): Promise<Result> {
  let me;
  try {
    me = await assertCallerIsAdmin(); // gate ANTES de service_role
  } catch {
    return { ok: false, error: "Operación restringida a admin." };
  }
  if (!me.email) return { ok: false, error: "Tu cuenta no tiene email para re-autenticar." };
  if (targetUserId === me.id) return { ok: false, error: "No puedes eliminarte a ti mismo." };
  if (!adminPassword) return { ok: false, error: "Escribe tu contraseña para confirmar." };

  // RE-AUTH: verificar la contraseña con un cliente DESECHABLE (anon, sin persistencia) → no rota
  // los tokens de la sesión viva del admin.
  const probe = createSupabasePasswordProbeClient();
  const { error: authErr } = await probe.auth.signInWithPassword({
    email: me.email,
    password: adminPassword,
  });
  if (authErr) return { ok: false, error: "Contraseña incorrecta." };
  await probe.auth.signOut(); // defensivo (persistSession:false ya evita persistir)

  // Solo entonces: borrado destructivo con service_role. CASCADE borra todo el histórico.
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(targetUserId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
