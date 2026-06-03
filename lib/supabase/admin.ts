import "server-only"; // ⚠ falla el build si se importa desde un componente cliente

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con SERVICE_ROLE (bypassa RLS; acceso a la API admin de GoTrue).
 * SOLO server-side, y SOLO desde server actions que ya llamaron assertCallerIsAdmin().
 * La key es server-only (SUPABASE_SERVICE_ROLE_KEY) — NUNCA NEXT_PUBLIC ni en el repo.
 * Lectura perezosa → no rompe el build si la env no está presente.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (server-only).");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Cliente DESECHABLE (anon, sin persistencia) para RE-AUTENTICAR verificando una contraseña sin
 * tocar la sesión viva del usuario. Se usa antes de operaciones destructivas (eliminar usuario):
 * firmar con el client de sesión rotaría los tokens del admin; este verifica la credencial y se
 * descarta. Usa la anon key (pública) — válida en servidor.
 */
export function createSupabasePasswordProbeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
