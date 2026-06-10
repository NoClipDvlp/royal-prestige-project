"use server";

// Server actions de PLANTILLAS del módulo MS (ADR-0027). NO-CORE. Corren bajo la sesión del distribuidor:
// la RLS de ms_templates (owner = auth.uid() AND ms_enabled(), 0018) hace cumplir propiedad + flag.
// assertMsEnabled() re-gatea en la app (defensa en profundidad). Sin service_role.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertMsEnabled } from "@/lib/ms/guard";
import { sanitizeHtml } from "@/lib/ms/sanitize";

type Result = { ok: boolean; error?: string; id?: string };

export async function createMsTemplate(input: {
  name: string;
  subject: string;
  bodyHtml: string;
}): Promise<Result> {
  let uid: string;
  try {
    uid = await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!input.name.trim() || !input.subject.trim() || !input.bodyHtml.trim()) {
    return { ok: false, error: "Nombre, asunto y cuerpo son obligatorios." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ms_templates")
    .insert({ owner_user_id: uid, name: input.name.trim(), subject: input.subject.trim(), body_html: sanitizeHtml(input.bodyHtml) })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ms/plantillas");
  return { ok: true, id: data.id as string };
}

export async function updateMsTemplate(
  id: string,
  changes: { name?: string; subject?: string; bodyHtml?: string },
): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) patch.name = changes.name.trim();
  if (changes.subject !== undefined) patch.subject = changes.subject.trim();
  if (changes.bodyHtml !== undefined) patch.body_html = sanitizeHtml(changes.bodyHtml);
  if (Object.keys(patch).length === 0) return { ok: true, id };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("ms_templates").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ms/plantillas");
  return { ok: true, id };
}

/** Soft-delete (deleted_at): la plantilla desaparece de la lista; las campañas que la usaron conservan su
 *  snapshot (no se rompen). */
export async function deleteMsTemplate(id: string): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("ms_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ms/plantillas");
  return { ok: true };
}

/** Duplica una plantilla (cabecera + contenido) con nombre "… (copia)". */
export async function duplicateMsTemplate(id: string): Promise<Result> {
  let uid: string;
  try {
    uid = await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { data: tpl } = await supabase
    .from("ms_templates")
    .select("name, subject, body_html")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tpl) return { ok: false, error: "Plantilla no encontrada." };
  const { data, error } = await supabase
    .from("ms_templates")
    .insert({
      owner_user_id: uid,
      name: `${tpl.name as string} (copia)`,
      subject: tpl.subject as string,
      body_html: tpl.body_html as string,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ms/plantillas");
  return { ok: true, id: data.id as string };
}
