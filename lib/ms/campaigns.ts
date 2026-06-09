"use server";

// Server actions de LOTES (campaigns) del módulo MS (ADR-0027). NO-CORE. RLS-self + assertMsEnabled, SIN
// service_role. La asignación plantilla→destinatarios se resuelve aquí y se materializa como RENDER POR FILA
// en ms_sends (Act.2-A). Envío por BATCH (≤100) con supresión→'skipped' y reanudación por el libro ms_sends.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertMsEnabled } from "@/lib/ms/guard";
import { renderHtmlBody, renderSubject, htmlToText } from "@/lib/ms/render";
import { sendMsBatch, type MsOutMessage } from "@/lib/ms/mailer";

type Result = { ok: boolean; error?: string; id?: string; sent?: number; failed?: number; skipped?: number };

/** Asignación resuelta por la UI: a cada destinatario, qué plantilla le toca (modos all/subset/odd_id/per_row). */
export type Assignment = { recipientId: string; templateId: string };

async function baseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  return `${proto}://${host}`;
}

function withFooter(html: string, unsubUrl: string): string {
  return `${html}<hr style="margin-top:24px;border:none;border-top:1px solid #e5e7eb"/><p style="font-size:12px;color:#6b7286;line-height:1.5">Recibes este correo como parte de un proceso de reclutamiento. Si no deseas recibir más, <a href="${unsubUrl}" style="color:#6d6cf0">date de baja aquí</a>.</p>`;
}

/** Destinatarios de un dataset para el armador de lotes (id + email para selección). */
export async function listRecipientsForCampaign(
  datasetId: string,
): Promise<{ id: string; email: string; valid: boolean }[]> {
  try {
    await assertMsEnabled();
  } catch {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ms_recipients")
    .select("id, email, email_valid")
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({ id: r.id as string, email: r.email as string, valid: Boolean(r.email_valid) }));
}

/** Arma un lote: materializa ms_sends (pending) con el render por destinatario según la asignación. */
export async function createCampaign(input: {
  datasetId: string;
  defaultTemplateId: string;
  assignments: Assignment[];
}): Promise<Result> {
  let uid: string;
  try {
    uid = await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (input.assignments.length === 0) return { ok: false, error: "Selecciona al menos un destinatario." };

  const supabase = await createSupabaseServerClient();
  const recIds = Array.from(new Set(input.assignments.map((a) => a.recipientId)));
  const tplIds = Array.from(new Set(input.assignments.map((a) => a.templateId)));

  const { data: recs } = await supabase.from("ms_recipients").select("id, email, fields").in("id", recIds);
  const { data: tpls } = await supabase.from("ms_templates").select("id, subject, body_html").in("id", tplIds);
  const recById = new Map((recs ?? []).map((r) => [r.id as string, r]));
  const tplById = new Map((tpls ?? []).map((t) => [t.id as string, t]));

  const { data: camp, error: ce } = await supabase
    .from("ms_campaigns")
    .insert({
      owner_user_id: uid,
      dataset_id: input.datasetId,
      template_id: input.defaultTemplateId,
      status: "draft",
      total_count: input.assignments.length,
    })
    .select("id")
    .single();
  if (ce || !camp) return { ok: false, error: ce?.message ?? "No se pudo crear el lote." };

  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const a of input.assignments) {
    const rec = recById.get(a.recipientId);
    const tpl = tplById.get(a.templateId);
    if (!rec || !tpl) continue;
    const email = (rec.email as string).trim();
    const key = email.toLowerCase();
    if (seen.has(key)) continue; // un envío por email/lote (unique de DB)
    seen.add(key);
    const fields = (rec.fields as Record<string, string>) ?? {};
    rows.push({
      campaign_id: camp.id as string,
      owner_user_id: uid,
      recipient_id: a.recipientId,
      email,
      subject_snapshot: renderSubject(tpl.subject as string, fields),
      body_html_snapshot: renderHtmlBody(tpl.body_html as string, fields),
      status: "pending",
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error: se } = await supabase.from("ms_sends").insert(rows.slice(i, i + 500));
    if (se) return { ok: false, error: se.message };
  }
  await supabase.from("ms_campaigns").update({ total_count: rows.length }).eq("id", camp.id as string);
  revalidatePath("/ms/lotes");
  return { ok: true, id: camp.id as string };
}

/** Envía (o reanuda) un lote: supresión→skipped, batch, actualiza ms_sends + estado/contadores. */
export async function sendCampaign(campaignId: string): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { data: camp } = await supabase
    .from("ms_campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp) return { ok: false, error: "Lote no encontrado." };
  if (camp.status === "sending") return { ok: false, error: "El lote ya se está enviando." };

  await supabase.from("ms_campaigns").update({ status: "sending", started_at: new Date().toISOString() }).eq("id", campaignId);

  // pendientes/fallidos = lo que falta por enviar (reanudación idempotente)
  const { data: pend } = await supabase
    .from("ms_sends")
    .select("id, email, subject_snapshot, body_html_snapshot, unsub_token")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "failed"]);
  const pending = pend ?? [];

  // supresiones del dueño → marcar skipped (no enviar)
  const { data: supp } = await supabase.from("ms_suppressions").select("email");
  const suppressed = new Set((supp ?? []).map((s) => (s.email as string).toLowerCase()));

  const base = await baseUrl();
  const toSend: { id: string; msg: MsOutMessage }[] = [];
  let skipped = 0;
  for (const s of pending) {
    const email = (s.email as string).trim();
    if (suppressed.has(email.toLowerCase())) {
      await supabase.from("ms_sends").update({ status: "skipped", error: "destinatario dado de baja" }).eq("id", s.id as string);
      skipped += 1;
      continue;
    }
    const unsubUrl = `${base}/auth/baja?t=${s.unsub_token as string}`;
    const html = withFooter((s.body_html_snapshot as string) ?? "", unsubUrl);
    toSend.push({
      id: s.id as string,
      msg: { to: email, subject: (s.subject_snapshot as string) ?? "", html, text: htmlToText(html), unsubUrl },
    });
  }

  let sent = 0;
  let failed = 0;
  if (toSend.length > 0) {
    let results: { ok: boolean; id?: string; error?: string }[];
    try {
      results = await sendMsBatch(toSend.map((t) => t.msg));
    } catch (e) {
      // p.ej. falta MS_MAIL_API_KEY → no marcamos nada como enviado; el lote queda reanudable
      await supabase.from("ms_campaigns").update({ status: "failed" }).eq("id", campaignId);
      return { ok: false, error: `Envío no configurado: ${(e as Error).message}` };
    }
    const nowIso = new Date().toISOString();
    for (let i = 0; i < toSend.length; i += 1) {
      const r = results[i];
      if (r?.ok) {
        sent += 1;
        await supabase
          .from("ms_sends")
          .update({ status: "sent", sent_at: nowIso, provider_message_id: r.id ?? null, error: null })
          .eq("id", toSend[i].id);
      } else {
        failed += 1;
        await supabase.from("ms_sends").update({ status: "failed", error: r?.error ?? "error desconocido" }).eq("id", toSend[i].id);
      }
    }
  }

  // recomputar contadores reales del lote (incluye envíos previos)
  const counts = await campaignCounts(supabase, campaignId);
  const status =
    counts.pending > 0 || counts.failed > 0
      ? counts.sent > 0
        ? "partial"
        : "failed"
      : "sent";
  await supabase
    .from("ms_campaigns")
    .update({ status, sent_count: counts.sent, failed_count: counts.failed, finished_at: new Date().toISOString() })
    .eq("id", campaignId);

  revalidatePath("/ms/lotes");
  revalidatePath(`/ms/lotes/${campaignId}`);
  return { ok: true, sent, failed, skipped };
}

async function campaignCounts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  campaignId: string,
): Promise<{ sent: number; failed: number; pending: number; skipped: number }> {
  const { data } = await supabase.from("ms_sends").select("status").eq("campaign_id", campaignId);
  const rows = data ?? [];
  const c = { sent: 0, failed: 0, pending: 0, skipped: 0 };
  for (const r of rows) {
    const s = r.status as keyof typeof c;
    if (s in c) c[s] += 1;
  }
  return c;
}

/** Programa el lote (Act.2-B): scheduled_at + status 'scheduled'. El render ya está materializado. */
export async function scheduleCampaign(campaignId: string, scheduledAtIso: string): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const when = new Date(scheduledAtIso);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Fecha/hora inválida." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("ms_campaigns")
    .update({ status: "scheduled", scheduled_at: when.toISOString() })
    .eq("id", campaignId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ms/lotes");
  return { ok: true };
}

/** Dispatch OPORTUNISTA: envía los lotes 'scheduled' vencidos DEL PROPIO usuario (se llama al abrir /ms/lotes).
 *  Cubre al usuario activo sin cron ni service_role. El dispatch desatendido (offline) queda como deuda infra. */
export async function processDueScheduled(): Promise<void> {
  try {
    await assertMsEnabled();
  } catch {
    return;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ms_campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());
  for (const c of data ?? []) {
    await sendCampaign(c.id as string);
  }
}

/** Cancela un lote (solo si draft/scheduled). */
export async function cancelCampaign(campaignId: string): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("ms_campaigns")
    .update({ status: "canceled", scheduled_at: null })
    .eq("id", campaignId)
    .in("status", ["draft", "scheduled"]);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ms/lotes");
  return { ok: true };
}

/** Duplica un lote como borrador: copia el público + render por fila (reset de estado/tokens). */
export async function duplicateCampaign(campaignId: string): Promise<Result> {
  let uid: string;
  try {
    uid = await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { data: camp } = await supabase
    .from("ms_campaigns")
    .select("dataset_id, template_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp) return { ok: false, error: "Lote no encontrado." };
  const { data: sends } = await supabase
    .from("ms_sends")
    .select("recipient_id, email, subject_snapshot, body_html_snapshot")
    .eq("campaign_id", campaignId);
  const { data: nuevo, error: ce } = await supabase
    .from("ms_campaigns")
    .insert({
      owner_user_id: uid,
      dataset_id: camp.dataset_id,
      template_id: camp.template_id,
      status: "draft",
      total_count: (sends ?? []).length,
    })
    .select("id")
    .single();
  if (ce || !nuevo) return { ok: false, error: ce?.message ?? "No se pudo duplicar." };
  const rows = (sends ?? []).map((s) => ({
    campaign_id: nuevo.id as string,
    owner_user_id: uid,
    recipient_id: s.recipient_id,
    email: s.email,
    subject_snapshot: s.subject_snapshot,
    body_html_snapshot: s.body_html_snapshot,
    status: "pending",
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: se } = await supabase.from("ms_sends").insert(rows.slice(i, i + 500));
    if (se) return { ok: false, error: se.message };
  }
  revalidatePath("/ms/lotes");
  return { ok: true, id: nuevo.id as string };
}

/** Envía UN correo de PRUEBA a la propia dirección del usuario, con la plantilla y una fila de ejemplo. */
export async function testSendTemplate(input: { templateId: string; datasetId?: string | null }): Promise<Result> {
  try {
    await assertMsEnabled();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const user = await getUser();
  const to = user?.email;
  if (!to) return { ok: false, error: "No se encontró tu correo de cuenta." };
  const supabase = await createSupabaseServerClient();
  const { data: tpl } = await supabase
    .from("ms_templates")
    .select("subject, body_html")
    .eq("id", input.templateId)
    .maybeSingle();
  if (!tpl) return { ok: false, error: "Plantilla no encontrada." };

  let fields: Record<string, string> = {};
  if (input.datasetId) {
    const { data: rec } = await supabase
      .from("ms_recipients")
      .select("fields")
      .eq("dataset_id", input.datasetId)
      .limit(1)
      .maybeSingle();
    fields = (rec?.fields as Record<string, string>) ?? {};
  }
  const subject = `[PRUEBA] ${renderSubject(tpl.subject as string, fields)}`;
  const html = renderHtmlBody(tpl.body_html as string, fields);
  try {
    const [r] = await sendMsBatch([{ to, subject, html, text: htmlToText(html) }]);
    if (!r?.ok) return { ok: false, error: r?.error ?? "No se pudo enviar la prueba." };
  } catch (e) {
    return { ok: false, error: `Envío no configurado: ${(e as Error).message}` };
  }
  return { ok: true };
}
