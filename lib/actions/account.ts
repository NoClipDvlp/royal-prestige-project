"use server";

// Server actions de CUENTA (self). Usan service_role SOLO sobre el app_metadata del PROPIO usuario
// (id de getUser() validado) — nunca cross-user. Es un gate self-scoped (no admin), bounded a user.id.

import { headers } from "next/headers";
import { getProfile, getUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPasswordChangedEmail, sendPendingReviewEmail, sendResetEmail } from "@/lib/email/mailer";

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
  if (error) {
    // ERROR 5 (ADR-0022): GoTrue rechaza reusar la contraseña actual (code 'same_password',
    // "New password should be different from the old password") → mensaje didáctico en vez de genérico.
    const code = (error as { code?: string }).code ?? "";
    if (code === "same_password" || /same.?password|different from the old/i.test(error.message)) {
      return { ok: false, error: "No puedes reutilizar tu contraseña anterior. Elige una distinta." };
    }
    return { ok: false, error: "No se pudo cambiar la contraseña." };
  }

  // Limpiar el flag forzado en AMBAS fuentes (columna = fuente de verdad del middleware + app_metadata = respaldo).
  // service_role sobre el PROPIO id: el trigger BLOQUEA al usuario que se limpia a sí mismo (auth.uid() no null);
  // por eso vamos por service_role (auth.uid() null → permitido). NO best-effort: si la columna no se limpia, el
  // middleware (columna OR app_metadata) deja al usuario atrapado en /auth/reset → lockout. ok:false → reintenta.
  try {
    const admin = createSupabaseAdminClient();
    const { error: colErr } = await admin.from("users").update({ must_set_password: false }).eq("id", user.id);
    if (colErr) return { ok: false, error: "Contraseña cambiada, pero no se pudo finalizar. Vuelve a intentarlo." };
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { must_set_password: false } });
  } catch {
    return { ok: false, error: "Contraseña cambiada, pero no se pudo finalizar. Vuelve a intentarlo." };
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
 * "Olvidé contraseña" (ADR-0023): envía un CÓDIGO de 6 dígitos (recovery) por correo branded, vía service_role
 * (generateLink → email_otp). No usa resetPasswordForEmail → esquiva el rate-limit de 60s/usuario y no depende
 * de plantillas de Supabase. NO revela si el email existe (siempre ok). El usuario teclea el código en
 * /auth/reset?mode=otp → verifyOtp. Código-only: sin enlace de verificación (inmune al pre-consumo del escáner).
 */
export async function requestPasswordOtp(email: string): Promise<Result> {
  const clean = email.trim().toLowerCase();
  if (!clean) return { ok: true };
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: clean });
    if (error || !data?.properties?.email_otp) return { ok: true }; // usuario inexistente u otro → no revelar
    console.log("[ADR-0023] email_otp presente en forgot:", Boolean(data.properties.email_otp));
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
    const otpUrl = `${origin}/auth/reset?mode=otp&email=${encodeURIComponent(clean)}`;
    const { data: u } = await admin.from("users").select("full_name").ilike("email", clean).maybeSingle();
    await sendResetEmail({ to: clean, fullName: (u?.full_name as string | undefined) ?? "", code: data.properties.email_otp, otpUrl });
  } catch {
    /* no revelar */
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
