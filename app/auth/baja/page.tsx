import { createSupabaseServerClient } from "@/lib/supabase/server";

// Baja pública one-click (ADR-0027 §3). SIN sesión: vive bajo /auth/* (prefijo público existente → el
// middleware no la redirige; NO se toca lib/auth/routing, que es core). Llama a ms_suppress_by_token (DEFINER,
// sin service_role): la autorización es el token (uuid v4 almacenado en ms_sends). No revela validez del token
// (no-op silencioso) → siempre confirma, sin oráculo.
export default async function BajaPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const validShape = !!t && /^[0-9a-fA-F-]{36}$/.test(t);
  if (validShape) {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("ms_suppress_by_token", { p_token: t });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef1f8] p-6 dark:bg-[#0b1220]">
      <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/90 p-8 text-center shadow-[0_18px_50px_-18px_rgba(28,35,71,.35)] dark:border-white/10 dark:bg-white/5">
        <div className="mb-1 text-sm font-semibold text-fg">Royal Control · Pistacore</div>
        {validShape ? (
          <>
            <h1 className="mt-3 text-lg font-semibold text-fg">Listo, te diste de baja</h1>
            <p className="mt-2 text-sm text-muted">
              No volverás a recibir correos de reclutamiento de este remitente. Si fue un error, contáctalo
              directamente.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-lg font-semibold text-fg">Enlace inválido</h1>
            <p className="mt-2 text-sm text-muted">
              El enlace de baja no es válido o está incompleto. Usa el enlace del pie del correo.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
