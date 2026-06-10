"use server";

// Server actions de lectura para la interactividad de la vista premium (drill/ventana sin recargar la página).
// Corren bajo la sesión del usuario → el gate de rol DEFINER de las funciones BI (ADR-0030) decide qué ve cada
// quien (auditor/admin = todos; distribuidor = su fila; el breakdown es admin/auditor-only). Sin gating extra.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadForecast,
  loadComplianceDrill,
  type ForecastRow,
  type DrillRow,
  type LoadDimension,
  type DrillDimension,
} from "@/lib/bi/premium";

export async function fetchForecast(p: {
  dStart: string;
  dEnd: string;
  dimension: LoadDimension;
  pUser?: string | null;
  pDistribution?: string | null;
}): Promise<ForecastRow[]> {
  const supabase = await createSupabaseServerClient();
  return loadForecast(supabase, p);
}

export async function fetchDrill(p: {
  dStart: string;
  dEnd: string;
  dimension: DrillDimension;
  pUser?: string | null;
  pDistribution?: string | null;
}): Promise<DrillRow[]> {
  const supabase = await createSupabaseServerClient();
  return loadComplianceDrill(supabase, p);
}
