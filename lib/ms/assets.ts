"use server";

// Subida de imágenes del cuerpo de correo (ADR-0032 §2 ENMIENDA). NO-CORE en cuanto a archivo, pero usa la
// política de service_role ya aprobada [CORE-APPROVED: ADR-0032]. Las policies de storage.objects no se
// pueden aplicar en Supabase (42501) → la subida va con service_role CONFINADO a este módulo (mismo patrón
// que el cron de ADR-0029; createClient inline, NO helper compartido; lib/env.ts intacto).
//
// Seguridad: valida SESIÓN authenticated + módulo habilitado + tipo/tamaño, y FIJA el path
// {user.id}/{uuid}.ext EN EL SERVIDOR (el cliente NO elige carpeta). Bucket público de lectura → URL pública.

import { createClient } from "@supabase/supabase-js";
import { getUser } from "@/lib/auth/server";
import { getMsEnabled } from "@/lib/ms/guard";

const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function uploadMsAsset(form: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  // gate: sesión + módulo habilitado (no se confía en el cliente)
  const user = await getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  if (!(await getMsEnabled())) return { ok: false, error: "El módulo de correo no está habilitado para tu cuenta." };

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Archivo inválido." };
  const ext = ALLOWED.get(file.type);
  if (!ext) return { ok: false, error: "Formato no permitido (usa PNG, JPG, WEBP o GIF)." };
  if (file.size > MAX_BYTES) return { ok: false, error: "La imagen supera 2 MB." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, error: "Subida no configurada (falta SUPABASE_SERVICE_ROLE_KEY)." };
  // service_role CONFINADO a este módulo (no helper compartido). La carpeta la fija el servidor con user.id.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const body = await file.arrayBuffer();
  const { error } = await admin.storage.from("ms_assets").upload(path, body, { contentType: file.type, upsert: false });
  if (error) return { ok: false, error: error.message };
  const { data } = admin.storage.from("ms_assets").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
