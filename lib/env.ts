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
