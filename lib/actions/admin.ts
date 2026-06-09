"use server";

// Server actions del panel admin. DOS modos:
//  • Asignaciones (rol/distribución/nombre/distribuciones/categorías): con la SESIÓN del admin (RLS admin +
//    el trigger permite porque app_current_role()='admin') → SIN service_role → esquiva DEBT-0010.
//  • Alta/reset de usuarios (API GoTrue): service_role GATEADO por assertCallerIsAdmin().

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertCallerIsAdmin, getProfile, type AppRole } from "@/lib/auth/server";
import { createSupabaseAdminClient, createSupabasePasswordProbeClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail, sendResetEmail, sendRoleAssignedEmail, sendRoleChangedEmail } from "@/lib/email/mailer";

/** Origin absoluto del request (para el redirectTo del enlace de set-password). */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

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

/**
 * Asignar rol + distribución con la sesión del admin. Respeta CHECK rol↔distribución.
 * notify (B4 ADR-0020): si true y el usuario QUEDA con rol → manda correo (bienvenida si venía sin rol;
 * "tu rol cambió" si ya tenía otro). El alta-por-admin pasa notify:false (ya envía su bienvenida con link)
 * → evita el doble correo. Best-effort: un fallo de correo NO revierte la asignación.
 */
export async function assignUserRole(
  userId: string,
  role: AppRole | null,
  distributionId: string | null,
  opts: { notify?: boolean } = {},
): Promise<Result> {
  const denied = await requireAdminOrError();
  if (denied) return denied;

  const needsDist = role === "distributor" || role === "jd" || role === "seller";
  const dist = needsDist ? distributionId : null; // admin/auditor/null ⇒ distribución null
  if (needsDist && !dist) return { ok: false, error: "Un distribuidor requiere una distribución." };

  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase
    .from("users")
    .select("role, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  const oldRole = (before?.role as AppRole | null) ?? null;

  const { error } = await supabase.from("users").update({ role, distribution_id: dist }).eq("id", userId);
  if (error) return { ok: false, error: error.message };

  if (opts.notify && role && before?.email) {
    let distributionName: string | null = null;
    if (dist) {
      const { data: d } = await supabase.from("distributions").select("name").eq("id", dist).maybeSingle();
      distributionName = (d?.name as string | undefined) ?? null;
    }
    const fullName = (before.full_name as string | undefined) ?? "";
    try {
      if (oldRole === null) {
        await sendRoleAssignedEmail({ to: before.email as string, fullName, role, distributionName });
      } else if (oldRole !== role) {
        await sendRoleChangedEmail({ to: before.email as string, fullName, role, distributionName });
      }
    } catch {
      // correo best-effort: la asignación ya quedó hecha.
    }
  }

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

/** Renombrar distribución (único campo editable). Sesión admin (RLS distributions_update). */
export async function updateDistribution(id: string, name: string): Promise<Result> {
  const denied = await requireAdminOrError();
  if (denied) return denied;
  if (!name.trim()) return { ok: false, error: "El nombre no puede estar vacío." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("distributions").update({ name: name.trim() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Eliminar distribución — REGLA A (#13): rechaza si tiene MIEMBROS (users.distribution_id) u OWNERS
 * (distribution_owners). Vacía → borra. Evita el 23503 de la FK users.distribution_id (NO ACTION) con un
 * mensaje claro en vez de un error de BD. Sesión admin (RLS distributions_delete).
 */
export async function deleteDistribution(id: string): Promise<Result> {
  const denied = await requireAdminOrError();
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();

  const { count: members } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("distribution_id", id);
  const { count: owners } = await supabase
    .from("distribution_owners")
    .select("id", { count: "exact", head: true })
    .eq("distribution_id", id);
  if ((members ?? 0) > 0 || (owners ?? 0) > 0) {
    return { ok: false, error: "No se puede eliminar: reasigna o elimina sus distribuidores primero." };
  }

  const { error } = await supabase.from("distributions").delete().eq("id", id);
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
/**
 * Alta de usuario ATÓMICA con rol (#3, ADR auth/cuenta): crea el usuario, fija rol+distribución y envía
 * un correo de bienvenida con un ENLACE para que establezca su propia contraseña (sin credencial en texto).
 * Reemplaza el flujo de contraseña temporal (DEBT-0008 cerrada). Requiere SMTP configurado (ver DEPLOY).
 */
export async function adminCreateUser(
  email: string,
  fullName: string,
  role: AppRole,
  distributionId: string | null,
): Promise<Result> {
  try {
    await assertCallerIsAdmin(); // ⚠ gate ANTES de tocar service_role
  } catch {
    return { ok: false, error: "Operación restringida a admin." };
  }
  const needsDist = role === "distributor" || role === "jd" || role === "seller";
  if (needsDist && !distributionId) return { ok: false, error: "Un distribuidor requiere una distribución." };

  const admin = createSupabaseAdminClient();
  // 1) Crear con contraseña aleatoria FUERTE que nunca se comparte + must_set_password (B1, ADR-0020):
  //    el usuario DEBE fijar la suya antes de usar la app (la intercepción del layout lo fuerza).
  const randomPwd = `Rc-${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`;
  const { data: created, error: ce } = await admin.auth.admin.createUser({
    email,
    password: randomPwd,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { must_set_password: true }, // tamper-resistant (no editable por el usuario)
  });
  if (ce || !created.user) {
    const msg = /already.*registered|exists/i.test(ce?.message ?? "")
      ? "Ese email ya está registrado." // B6 dup email
      : ce?.message ?? "No se pudo crear el usuario.";
    return { ok: false, error: msg };
  }

  // 2) Rol+distribución con la SESIÓN admin (el trigger forbid_self_privilege_escalation exige
  //    app_current_role()='admin'; service_role lo bloquearía — workaround DEBT-0010, reusa assignUserRole).
  //    notify:false → camino A NO manda correo de bienvenida-rol (ya envía su propia bienvenida con link).
  const roleRes = await assignUserRole(created.user.id, role, distributionId, { notify: false });
  if (!roleRes.ok) return { ok: false, error: `Usuario creado, pero falló asignar el rol: ${roleRes.error}` };

  // 3) Enlace "establece tu contraseña" (recovery → /auth/reset?mode=update). generateLink NO envía correo.
  const origin = await requestOrigin();
  const next = encodeURIComponent("/auth/reset?mode=update");
  const { data: linkData, error: le } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/callback?next=${next}` },
  });
  if (le || !linkData?.properties?.action_link) {
    return { ok: false, error: "Usuario y rol creados, pero no se pudo generar el enlace de contraseña." };
  }

  // 4) Nombre de distribución (para el correo) + envío del correo rico.
  let distributionName: string | null = null;
  if (distributionId) {
    const supabase = await createSupabaseServerClient();
    const { data: d } = await supabase.from("distributions").select("name").eq("id", distributionId).maybeSingle();
    distributionName = (d?.name as string | undefined) ?? null;
  }
  try {
    await sendWelcomeEmail({
      to: email,
      fullName,
      role,
      distributionName,
      setPasswordLink: linkData.properties.action_link,
    });
  } catch (e) {
    return { ok: false, error: `Usuario creado, pero el correo no se envió (revisa SMTP): ${(e as Error).message}` };
  }

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Reset por admin (B2 ADR-0020): invalidación DURA. Fija una clave ALEATORIA desconocida (la anterior deja
 * de servir) + must_set_password + manda correo branded con enlace para que el usuario cree la suya. El
 * admin ya no ve/entrega ninguna contraseña. service_role GATEADO.
 */
export async function adminResetPassword(userId: string): Promise<Result> {
  try {
    await assertCallerIsAdmin();
  } catch {
    return { ok: false, error: "Operación restringida a admin." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: u } = await supabase.from("users").select("email, full_name").eq("id", userId).maybeSingle();
  if (!u?.email) return { ok: false, error: "El usuario no tiene email." };

  const admin = createSupabaseAdminClient();
  const randomPwd = `Rc-${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`;
  const { error: ue } = await admin.auth.admin.updateUserById(userId, {
    password: randomPwd, // invalida la anterior (nadie la conoce)
    app_metadata: { must_set_password: true }, // fuerza el cambio al entrar
  });
  if (ue) return { ok: false, error: ue.message };

  const origin = await requestOrigin();
  const next = encodeURIComponent("/auth/reset?mode=update");
  const { data: linkData, error: le } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: u.email as string,
    options: { redirectTo: `${origin}/auth/callback?next=${next}` },
  });
  if (le || !linkData?.properties?.action_link) {
    return { ok: false, error: "Clave reseteada, pero no se pudo generar el enlace." };
  }
  try {
    await sendResetEmail({
      to: u.email as string,
      fullName: (u.full_name as string | undefined) ?? "",
      setPasswordLink: linkData.properties.action_link,
    });
  } catch (e) {
    return { ok: false, error: `Clave reseteada, pero el correo no se envió (revisa SMTP): ${(e as Error).message}` };
  }
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
  // ⚠ B3 (ADR-0020): scope 'local' — revoca SOLO la sesión efímera del probe. El default 'global' revocaría
  // TODOS los refresh tokens del admin (el probe firmó como él) → lo deslogueaba. Causa del bug en prod.
  await probe.auth.signOut({ scope: "local" });

  // Solo entonces: borrado destructivo con service_role. Las FKs de 0011 (ADR-0017) garantizan la
  // integridad: los datos PROPIOS (tasks/instancias/categorías personales) se borran en cascada; los
  // artefactos COMPARTIDOS que creó (categorías globales, plantillas, asignaciones) sobreviven con autor NULL.
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(targetUserId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
