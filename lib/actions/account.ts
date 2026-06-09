"use server";

// Server actions de CUENTA (self). Usan service_role SOLO sobre el app_metadata del PROPIO usuario
// (id de getUser() validado) — nunca cross-user. Es un gate self-scoped (no admin), bounded a user.id.

import { getProfile, getUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPasswordChangedEmail, sendPendingReviewEmail } from "@/lib/email/mailer";

type Result = { ok: boolean; error?: string };

/**
 * Cambiar la propia contraseña (B7 + flujo set-password forzado, ADR-0020): actualiza la clave con la
 * sesión del usuario, LIMPIA must_set_password (app_metadata, vía service_role sobre el propio id) y manda
 * el aviso de seguridad. El cliente debe refrescar la sesión después (el JWT trae el app_metadata viejo).
 */
export async function changeOwnPassword(newPassword: string): Promise<Result> {
  const user = await getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  if (!newPassword || newPassword.length < 8) return { ok: false, error: "Mínimo 8 caracteres." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: "No se pudo cambiar la contraseña." };

  // Limpiar el flag forzado (si estaba) — service_role sobre el PROPIO id.
  try {
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { must_set_password: false } });
  } catch {
    // si falla, la intercepción reaparecerá; no es crítico para la seguridad.
  }

  // Aviso de seguridad (best-effort).
  try {
    const fullName = (user.user_metadata?.full_name as string | undefined) ?? "";
    if (user.email) await sendPasswordChangedEmail({ to: user.email, fullName });
  } catch {
    /* best-effort */
  }
  return { ok: true };
}

/**
 * Aviso "cuenta en revisión" (B4): se llama una vez desde /sin-rol. Idempotente vía app_metadata.review_notified
 * → no reenvía en cada visita. Solo para usuarios autenticados SIN rol.
 */
export async function notifyPendingReviewOnce(): Promise<Result> {
  const user = await getUser();
  if (!user) return { ok: true };
  const { role } = await getProfile();
  if (role !== null) return { ok: true }; // ya tiene rol → nada que avisar
  if (user.app_metadata?.review_notified) return { ok: true }; // ya se notificó

  try {
    const fullName = (user.user_metadata?.full_name as string | undefined) ?? "";
    if (user.email) await sendPendingReviewEmail({ to: user.email, fullName });
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { review_notified: true } });
  } catch {
    /* best-effort: si falla, se reintenta en la próxima visita */
  }
  return { ok: true };
}

/**
 * ¿Email disponible para registro? (B6) — usa service_role para consultar public.users (la RLS no deja ver
 * filas ajenas). ⚠ Endpoint abierto → enumeración leve, asumida como decisión de producto (bloquear duplicados).
 */
export async function checkEmailAvailable(email: string): Promise<{ available: boolean }> {
  const clean = email.trim().toLowerCase();
  if (!clean) return { available: false };
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.from("users").select("id").ilike("email", clean).maybeSingle();
    return { available: !data };
  } catch {
    return { available: true }; // ante error, no bloquear el registro (Supabase rechazará el duplicado real)
  }
}
