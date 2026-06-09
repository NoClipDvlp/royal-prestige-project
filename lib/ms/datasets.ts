"use server";

// Server actions de DESTINATARIOS ("remitentes" en palabras de Nicolas = recipients) y sus LISTAS (datasets).
// NO-CORE. RLS-self (owner + ms_enabled, 0018) + assertMsEnabled. Sin service_role.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertMsEnabled } from "@/lib/ms/guard";
import { isValidEmail } from "@/lib/ms/csv";
import type { MsColumns } from "@/lib/ms/types";

type Result = { ok: boolean; error?: string; id?: string };

/** Recalcula y persiste recipient_count del dataset (tras add/delete). */
async function syncCount(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  datasetId: string,
): Promise<void> {
  const { count } = await supabase
    .from("ms_recipients")
    .select("id", { count: "exact", head: true })
    .eq("dataset_id", datasetId);
  await supabase.from("ms_datasets").update({ recipient_count: count ?? 0 }).eq("id", datasetId);
}

/** Crea una lista (dataset) + sus destinatarios desde un CSV ya mapeado en el cliente. */
export async function createDataset(input: {
  name: string;
  columns: MsColumns;
  recipients: { email: string; fields: Record<string, string>; valid: boolean }[];
  sourceFilename?: string | null;
}): Promise<Result> {
  let uid: string;
  try {
    uid = await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!input.name.trim()) return { ok: false, error: "Ponle un nombre a la lista." };
  if (input.recipients.length === 0) return { ok: false, error: "No hay destinatarios para guardar." };

  const supabase = await createSupabaseServerClient();
  const { data: ds, error } = await supabase
    .from("ms_datasets")
    .insert({
      owner_user_id: uid,
      name: input.name.trim(),
      source_filename: input.sourceFilename ?? null,
      columns: input.columns,
      recipient_count: input.recipients.length,
    })
    .select("id")
    .single();
  if (error || !ds) return { ok: false, error: error?.message ?? "No se pudo crear la lista." };

  const rows = input.recipients.map((r) => ({
    dataset_id: ds.id as string,
    owner_user_id: uid,
    email: r.email,
    fields: r.fields,
    email_valid: r.valid,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: re } = await supabase.from("ms_recipients").insert(rows.slice(i, i + 500));
    if (re) return { ok: false, error: re.message };
  }
  await syncCount(supabase, ds.id as string);
  revalidatePath("/ms/destinatarios");
  return { ok: true, id: ds.id as string };
}

/** Soft-delete de la lista (deleted_at): desaparece del listado; conserva los datos. */
export async function deleteDataset(id: string): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("ms_datasets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ms/destinatarios");
  return { ok: true };
}

/** Renombra la lista. */
export async function renameDataset(id: string, name: string): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!name.trim()) return { ok: false, error: "El nombre no puede ir vacío." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("ms_datasets").update({ name: name.trim() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ms/destinatarios");
  return { ok: true };
}

export async function addRecipient(
  datasetId: string,
  input: { email: string; fields: Record<string, string> },
): Promise<Result> {
  let uid: string;
  try {
    uid = await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const email = (input.email ?? "").trim();
  if (!email) return { ok: false, error: "El correo es obligatorio." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("ms_recipients").insert({
    dataset_id: datasetId,
    owner_user_id: uid,
    email,
    fields: input.fields ?? {},
    email_valid: isValidEmail(email),
  });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "Ese correo ya está en la lista." : error.message };
  }
  await syncCount(supabase, datasetId);
  revalidatePath(`/ms/destinatarios/${datasetId}`);
  return { ok: true };
}

export async function updateRecipient(
  id: string,
  input: { email: string; fields: Record<string, string> },
): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const email = (input.email ?? "").trim();
  if (!email) return { ok: false, error: "El correo es obligatorio." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("ms_recipients")
    .update({ email, fields: input.fields ?? {}, email_valid: isValidEmail(email) })
    .eq("id", id);
  if (error) {
    return { ok: false, error: error.code === "23505" ? "Ese correo ya está en la lista." : error.message };
  }
  revalidatePath("/ms/destinatarios");
  return { ok: true };
}

export async function deleteRecipient(id: string, datasetId: string): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("ms_recipients").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await syncCount(supabase, datasetId);
  revalidatePath(`/ms/destinatarios/${datasetId}`);
  return { ok: true };
}

/** Duplica un destinatario (mismo dataset). Ajusta el email para no chocar con el unique (prefijo "copia-"). */
export async function duplicateRecipient(id: string): Promise<Result> {
  let uid: string;
  try {
    uid = await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { data: r } = await supabase
    .from("ms_recipients")
    .select("dataset_id, email, fields")
    .eq("id", id)
    .maybeSingle();
  if (!r) return { ok: false, error: "Destinatario no encontrado." };
  const email = `copia-${r.email as string}`;
  const { error } = await supabase.from("ms_recipients").insert({
    dataset_id: r.dataset_id as string,
    owner_user_id: uid,
    email,
    fields: r.fields ?? {},
    email_valid: isValidEmail(email),
  });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "Ya existe la copia; edítala." : error.message };
  }
  await syncCount(supabase, r.dataset_id as string);
  revalidatePath(`/ms/destinatarios/${r.dataset_id as string}`);
  return { ok: true };
}
