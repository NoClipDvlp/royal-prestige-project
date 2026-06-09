import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Intercambia el code por sesión: cubre OAuth (Google), confirmación de email y recovery.
// `next` permite redirigir a /auth/reset?mode=update tras un enlace de recuperación.
// B8 (ADR-0020): `next` se valida contra una ALLOWLIST de rutas internas → cero riesgo de open-redirect.
const ALLOWED_NEXT = new Set(["/", "/auth/reset?mode=update"]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/";
  const next = ALLOWED_NEXT.has(nextRaw) ? nextRaw : "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
