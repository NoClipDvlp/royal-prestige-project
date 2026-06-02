// ⚠ CORE (.coreignore: lib/auth/). Autorizado por ADR-0006.
//
// Guards de sesión para Server Components / Server Actions.
// ⚠ REGLA DURA: para autorización SIEMPRE se usa getUser() (valida el JWT contra el servidor de
// Supabase). NUNCA getSession() (lee la cookie → falsificable; footgun #1 de Supabase-SSR).

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "auditor" | "distributor" | "jd" | "seller";
export type Profile = { role: AppRole | null; distributionId: string | null };

/** Usuario autenticado VALIDADO (getUser, no getSession). null si no hay sesión válida. */
export async function getUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/**
 * Perfil (role + distribution) de la fila public.users del usuario actual.
 * Si NO hay fila (orfandad: auth sin perfil) o hay error → se trata como role=null
 * (fail-closed → mismo efecto que un usuario sin rol → pantalla "contacta admin").
 */
export async function getProfile(): Promise<Profile> {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return { role: null, distributionId: null };

  const { data, error } = await supabase
    .from("users")
    .select("role, distribution_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error || !data) return { role: null, distributionId: null };
  return {
    role: (data.role as AppRole | null) ?? null,
    distributionId: (data.distribution_id as string | null) ?? null,
  };
}

/** Exige sesión; si no hay → redirige a /login. Devuelve el usuario validado. */
export async function requireAuth(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige un rol concreto. Sin rol → /sin-rol; rol distinto → / (dashboard). */
export async function requireRole(role: AppRole): Promise<Profile> {
  const user = await getUser();
  if (!user) redirect("/login");
  const profile = await getProfile();
  if (profile.role === null) redirect("/sin-rol");
  if (profile.role !== role) redirect("/");
  return profile;
}

/**
 * RE-GATE de service_role. TODA server action que use el service_role (reset por admin, alta de
 * usuarios, jobs) DEBE llamar esto ANTES: service_role bypassa la RLS, así que la autorización se
 * re-verifica a mano con getUser()+rol. Lanza si el llamante no es admin.
 *
 * Uso (en sub-paso 3 / features):
 *   export async function adminResetPassword(...) { await assertCallerIsAdmin(); /* ...service_role... *\/ }
 */
export async function assertCallerIsAdmin(): Promise<User> {
  const user = await getUser();
  if (!user) throw new Error("No autenticado");
  const profile = await getProfile();
  if (profile.role !== "admin") {
    throw new Error("Operación restringida a admin");
  }
  return user;
}
