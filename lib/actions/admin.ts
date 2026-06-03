"use server";

// Server actions del panel admin. DOS modos:
//  • Asignaciones (rol/distribución/nombre/distribuciones/categorías): con la SESIÓN del admin (RLS admin +
//    el trigger permite porque app_current_role()='admin') → SIN service_role → esquiva DEBT-0010.
//  • Alta/reset de usuarios (API GoTrue): service_role GATEADO por assertCallerIsAdmin().

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertCallerIsAdmin, getProfile, type AppRole } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Result = { ok: boolean; error?: string };

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
