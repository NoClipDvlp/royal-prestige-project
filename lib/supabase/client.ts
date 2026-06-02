import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Cliente Supabase para el navegador (anon key → respeta la RLS).
 *
 * Hito 0: SOLO inicialización vía env vars. Sin auth, sin queries, sin schema.
 * Se expone como factory (no singleton de módulo) para diferir la lectura de env
 * al punto de uso y mantener el esqueleto sin efectos en import.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  return createClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey());
}
