import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Intercambia el code por sesión: cubre OAuth (Google), confirmación de email y recovery.
// `next` permite redirigir a /auth/reset?mode=update tras un enlace de recuperación.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // `next` es una ruta interna controlada por nosotros (login/reset). Redirige relativo al origin.
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
