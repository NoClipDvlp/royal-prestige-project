"use server";

// Subida de imágenes del cuerpo de correo (ADR-0032). NO-CORE. Sube al bucket ms_assets bajo la sesión del
// distribuidor → la RLS owner-path (0020) exige el prefijo {uid}/... (sin service_role). Valida tipo/tamaño
// EN SERVIDOR (no se confía en el cliente). Devuelve la URL pública para insertar <img src>.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertMsEnabled } from "@/lib/ms/guard";

const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function uploadMsAsset(form: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  let uid: string;
  try {
    uid = await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Archivo inválido." };
  const ext = ALLOWED.get(file.type);
  if (!ext) return { ok: false, error: "Formato no permitido (usa PNG, JPG, WEBP o GIF)." };
  if (file.size > MAX_BYTES) return { ok: false, error: "La imagen supera 2 MB." };

  const supabase = await createSupabaseServerClient();
  const name = `${uid}/${crypto.randomUUID()}.${ext}`; // path con prefijo del owner → pasa la RLS owner-path
  const { error } = await supabase.storage.from("ms_assets").upload(name, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };
  const { data } = supabase.storage.from("ms_assets").getPublicUrl(name);
  return { ok: true, url: data.publicUrl };
}
