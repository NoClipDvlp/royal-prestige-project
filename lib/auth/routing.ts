// ⚠ CORE (.coreignore: lib/auth/). Autorizado por ADR-0006.
//
// Decisión de routing por estado de sesión. PURA — sin dependencias de Supabase/Next →
// unit-testable de verdad. Devuelve la ruta a la que redirigir, o null si `pathname` es permitido.

export type AuthState = { authenticated: boolean; hasRole: boolean; mustSetPassword: boolean };

const PUBLIC_EXACT = new Set(["/login", "/signup"]);
const PUBLIC_PREFIXES = ["/auth/"];
const NO_ROLE_ROUTE = "/sin-rol";
const SET_PASSWORD_ROUTE = "/auth/reset?mode=update"; // pantalla de set-password (bajo /auth/* → pública)

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function resolveAuthRedirect(pathname: string, state: AuthState): string | null {
  // 1) Sin sesión → solo rutas públicas; el resto a /login.
  if (!state.authenticated) {
    return isPublicRoute(pathname) ? null : "/login";
  }
  // 2) DEBE fijar contraseña (B1/ADR-0022): se fuerza la pantalla de set-password ANTES de cualquier uso.
  //    Las rutas /auth/* (incl. la de set-password y el callback) quedan libres → no hay bucle. Cubre TODAS
  //    las páginas Y los POST de server actions (el middleware corre en ambos). Prioritario sobre el rol.
  if (state.mustSetPassword && !isPublicRoute(pathname)) {
    return SET_PASSWORD_ROUTE;
  }
  // 3) Autenticado SIN rol (incluye perfil ausente/orfandad) → solo /sin-rol.
  if (!state.hasRole) {
    return pathname === NO_ROLE_ROUTE ? null : NO_ROLE_ROUTE;
  }
  // 4) Autenticado CON rol → fuera de las pantallas de auth/onboarding.
  if (PUBLIC_EXACT.has(pathname) || pathname === NO_ROLE_ROUTE) {
    return "/";
  }
  return null;
}
