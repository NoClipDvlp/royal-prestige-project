/**
 * Lectura tipada de variables de entorno (Hito 0).
 *
 * Solo expone las variables públicas de Supabase (cliente browser).
 * La service_role key NUNCA se lee aquí ni se expone al cliente: se salta la RLS
 * y anularía el aislamiento por distribución (docs/DATA_MODEL.md §7).
 */

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env.local y rellena los valores.`,
    );
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: () =>
    required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
};

/**
 * Variables SERVER-ONLY de SMTP (correo de alta, #3). NO son NEXT_PUBLIC → nunca se bundlean al cliente.
 * Lectura perezosa (solo al enviar) → no rompen el build si faltan. Se leen únicamente desde lib/email.
 */
export const serverEnv = {
  smtpHost: () => required("SMTP_HOST", process.env.SMTP_HOST),
  smtpPort: () => Number(required("SMTP_PORT", process.env.SMTP_PORT)),
  smtpUser: () => required("SMTP_USER", process.env.SMTP_USER),
  smtpPass: () => required("SMTP_PASS", process.env.SMTP_PASS),
  smtpFrom: () =>
    process.env.SMTP_FROM ?? `Pistacore <${required("SMTP_USER", process.env.SMTP_USER)}>`,

  // ── Correo MASIVO (MS, ADR-0027) — server-only, AISLADO del SMTP de auth (subdominio + Resend). ──
  // Contrato: Nicolas configura MS_MAIL_API_KEY (Resend) + DNS del subdominio. El From va por @mail.pistacore.com
  // y el Reply-To al alias (ADR-0027 §0/Q1). La API key es obligatoria (no se hardcodea credencial); From/Reply-To
  // tienen default a las direcciones acordadas y son overridable por env.
  msMailApiKey: () => required("MS_MAIL_API_KEY", process.env.MS_MAIL_API_KEY),
  msMailFrom: () =>
    process.env.MS_MAIL_FROM ?? "Pistacore Reclutamiento <home-ms-recruitments@mail.pistacore.com>",
  msMailReplyTo: () => process.env.MS_MAIL_REPLY_TO ?? "home-ms-recruitments@pistacore.com",
};
