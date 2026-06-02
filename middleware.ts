// ⚠ CORE (.coreignore: middleware.ts). Autorizado por ADR-0006.
//
// Sesión SSR de Supabase + routing por estado. ⚠ Usa getUser() (valida el JWT contra el servidor),
// NUNCA getSession() (cookie falsificable). El gate REAL de datos es la RLS; esto es UX-routing +
// refresh de sesión + defensa en profundidad.

import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { resolveAuthRedirect } from "@/lib/auth/routing";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        // options de Supabase → httpOnly + secure + sameSite=lax.
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // ⚠ getUser() valida el JWT; jamás getSession() para autorización.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasRole = false;
  if (user) {
    // Perfil ausente (orfandad) o role=null → hasRole=false → /sin-rol. Fail-closed ante error.
    const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
    hasRole = Boolean(data?.role);
  }

  const target = resolveAuthRedirect(request.nextUrl.pathname, {
    authenticated: Boolean(user),
    hasRole,
  });

  if (target && target !== request.nextUrl.pathname) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Todo salvo estáticos/imágenes/favicon (incluye el logo de marca).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|royal-prestige-logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
