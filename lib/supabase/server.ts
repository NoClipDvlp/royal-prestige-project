import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Cliente Supabase para Server Components / Server Actions (sesión vía cookies SSR).
 * Env leído de forma perezosa (publicEnv.*) → no rompe el build sin env real.
 * NO usar en middleware: allí las cookies se enlazan a NextRequest/Response (ver middleware.ts).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // En Server Components el set de cookies puede no estar permitido;
          // el refresh real de la sesión ocurre en middleware.ts.
        }
      },
    },
  });
}
