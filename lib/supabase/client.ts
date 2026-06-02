import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Cliente Supabase para el navegador (sesión vía cookies SSR, compartida con middleware/server).
 * Crear PEREZOSAMENTE dentro de handlers (no en module/mount) → la página renderiza sin env real.
 * Solo anon key + RLS. La autorización real la dan middleware (getUser) + RLS; aquí NUNCA service_role.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey());
}
