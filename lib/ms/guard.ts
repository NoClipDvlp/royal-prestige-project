import "server-only"; // ⚠ jamás al cliente

import { cache } from "react";
import { getUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Gate del módulo MS (ADR-0027 §2) a nivel APP. NO-CORE: NO toca lib/auth; lee la columna users.ms_mailing_enabled
// bajo la sesión del usuario (RLS users_select permite la propia fila). El gate REAL de datos es la RLS de ms_*
// (doble candado owner + ms_enabled() en 0018). Esto es la capa de UX/ruta (mostrar/ocultar la sección).

/** ¿El usuario actual tiene habilitado el correo masivo? Memoizado per-request (como getProfile). */
export const getMsEnabled = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("users")
    .select("ms_mailing_enabled")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(data?.ms_mailing_enabled);
});

/** Re-gate para Server Actions del módulo: lanza si el módulo no está habilitado (defensa en profundidad
 *  además de la RLS). Devuelve el id del usuario para conveniencia. */
export async function assertMsEnabled(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("No autenticado.");
  const enabled = await getMsEnabled();
  if (!enabled) throw new Error("El módulo de correo no está habilitado para tu cuenta.");
  return user.id;
}
