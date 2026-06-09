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
  let mustSetPassword = false;
  if (user) {
    // hasRole: perfil ausente (orfandad)/role=null/error de SELECT → false → /sin-rol (fail-closed, restrictivo).
    // must_set_password (ADR-0022): la COLUMNA es la fuente fresca (sin staleness) y app_metadata el respaldo.
    // Si el SELECT falla, la columna queda indeterminada (data=null) y el gate recae en app_metadata: a propósito
    // NO se fuerza true ante error transitorio (eso expulsaría a TODA la base a /auth/reset); el respaldo ya cubre
    // el flujo PKCE. En operación normal columna y app_metadata se mantienen consistentes (admin setea ambos,
    // changeOwnPassword limpia ambos), así que la ventana de divergencia es nula.
    const { data } = await supabase.from("users").select("role, must_set_password").eq("id", user.id).maybeSingle();
    hasRole = Boolean(data?.role);
    mustSetPassword =
      Boolean(data?.must_set_password) ||
      Boolean((user.app_metadata as Record<string, unknown> | undefined)?.must_set_password);
  }

  const target = resolveAuthRedirect(request.nextUrl.pathname, {
    authenticated: Boolean(user),
    hasRole,
    mustSetPassword,
  });

  if (target) {
    const [p, q] = target.split("?"); // el target puede llevar query (set-password = /auth/reset?mode=update)
    if (p !== request.nextUrl.pathname) {
      // anti-bucle: compara solo el path
      const url = request.nextUrl.clone();
      url.pathname = p;
      url.search = q ? `?${q}` : "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Todo salvo estáticos/imágenes/favicon (incluye el logo de marca).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|royal-prestige-logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
