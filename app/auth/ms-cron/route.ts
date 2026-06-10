// Cron de ENVÍO DESATENDIDO de lotes programados (ADR-0029, [CORE-APPROVED: ADR-0029]).
// Disparador = VERCEL CRON nativo (Pro): vercel.json '*/5 * * * *' → esta route. Vercel inyecta
// 'Authorization: Bearer ${CRON_SECRET}' en las llamadas de cron, que validamos abajo (inválido/ausente → 401).
// (Cron externo cron-job.org con el mismo header = plan B documentado.) Vive bajo /auth/* (prefijo público
// → sin sesión, sin tocar middleware/routing core).
//
// ⚠ service_role CONFINADO a esta route (creado inline; NO un helper compartido — ADR-0029). Es el lugar
// canónico para una credencial de servicio (job de sistema), no la sesión de un usuario (≠ veto de ADR-0025).
// 5 guardas (ADR-0029 §2): (1) CRON_SECRET o 401; (2) lock atómico scheduled→sending + unique(campaign,email)
// anti doble-envío; (3) re-chequeo del flag del owner (revocado → lote 'failed' con motivo en ms_sends.error);
// (4) supresiones → skipped; (5) batch ≤100 (ya garantizado al armar el lote).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMsBatch, type MsOutMessage } from "@/lib/ms/mailer";
import { htmlToText } from "@/lib/ms/render";

export const dynamic = "force-dynamic";
// Pro permite ventanas largas: varios lotes (≤100 c/u) en una pasada. 300s = tope cómodo.
export const maxDuration = 300;

function withFooter(html: string, unsubUrl: string): string {
  return `${html}<hr style="margin-top:24px;border:none;border-top:1px solid #e5e7eb"/><p style="font-size:12px;color:#6b7286;line-height:1.5">Recibes este correo como parte de un proceso de reclutamiento. Si no deseas recibir más, <a href="${unsubUrl}" style="color:#6d6cf0">date de baja aquí</a>.</p>`;
}

export async function POST(req: Request) {
  return dispatch(req);
}
export async function GET(req: Request) {
  return dispatch(req);
}

async function dispatch(req: Request): Promise<Response> {
  // (1) secreto server-only
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = header || new URL(req.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "dispatch no configurado (faltan env)" }, { status: 500 });
  }
  // cliente service_role confinado a esta route (bypassa RLS para el job cross-owner)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const origin = new URL(req.url).origin;
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from("ms_campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso);

  let processed = 0;
  let sentTotal = 0;
  let failedTotal = 0;
  let skippedTotal = 0;

  for (const c of due ?? []) {
    const campaignId = c.id as string;
    // (2) lock atómico: solo gana quien aún la ve 'scheduled'
    const { data: locked } = await admin
      .from("ms_campaigns")
      .update({ status: "sending", started_at: nowIso })
      .eq("id", campaignId)
      .eq("status", "scheduled")
      .select("id, owner_user_id")
      .maybeSingle();
    if (!locked) continue; // otro tick ya lo tomó
    processed += 1;
    const ownerId = locked.owner_user_id as string;

    // (3) re-chequeo del flag del owner (el admin pudo revocarlo entre programar y disparar)
    const { data: owner } = await admin.from("users").select("ms_mailing_enabled").eq("id", ownerId).maybeSingle();
    if (!owner?.ms_mailing_enabled) {
      await admin
        .from("ms_sends")
        .update({ status: "failed", error: "módulo deshabilitado para el owner" })
        .eq("campaign_id", campaignId)
        .in("status", ["pending", "failed"]);
      await admin.from("ms_campaigns").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", campaignId);
      continue;
    }

    const { data: pend } = await admin
      .from("ms_sends")
      .select("id, email, subject_snapshot, body_html_snapshot, unsub_token")
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "failed"]);
    const { data: supp } = await admin.from("ms_suppressions").select("email").eq("owner_user_id", ownerId);
    const suppressed = new Set((supp ?? []).map((s) => (s.email as string).toLowerCase()));

    const toSend: { id: string; msg: MsOutMessage }[] = [];
    for (const s of pend ?? []) {
      const email = (s.email as string).trim();
      // (4) supresiones → skipped
      if (suppressed.has(email.toLowerCase())) {
        await admin.from("ms_sends").update({ status: "skipped", error: "destinatario dado de baja" }).eq("id", s.id as string);
        skippedTotal += 1;
        continue;
      }
      const unsubUrl = `${origin}/auth/baja?t=${s.unsub_token as string}`;
      const html = withFooter((s.body_html_snapshot as string) ?? "", unsubUrl);
      toSend.push({ id: s.id as string, msg: { to: email, subject: (s.subject_snapshot as string) ?? "", html, text: htmlToText(html), unsubUrl } });
    }

    let sent = 0;
    let failed = 0;
    if (toSend.length > 0) {
      let results: { ok: boolean; id?: string; error?: string }[];
      try {
        results = await sendMsBatch(toSend.map((t) => t.msg));
      } catch (e) {
        await admin.from("ms_campaigns").update({ status: "failed" }).eq("id", campaignId);
        failedTotal += toSend.length;
        continue;
      }
      const ts = new Date().toISOString();
      for (let i = 0; i < toSend.length; i += 1) {
        const r = results[i];
        if (r?.ok) {
          sent += 1;
          await admin.from("ms_sends").update({ status: "sent", sent_at: ts, provider_message_id: r.id ?? null, error: null }).eq("id", toSend[i].id);
        } else {
          failed += 1;
          await admin.from("ms_sends").update({ status: "failed", error: r?.error ?? "error desconocido" }).eq("id", toSend[i].id);
        }
      }
    }

    const { data: all } = await admin.from("ms_sends").select("status").eq("campaign_id", campaignId);
    const counts = { sent: 0, failed: 0, pending: 0, skipped: 0 };
    for (const r of all ?? []) {
      const k = r.status as keyof typeof counts;
      if (k in counts) counts[k] += 1;
    }
    const status = counts.pending > 0 || counts.failed > 0 ? (counts.sent > 0 ? "partial" : "failed") : "sent";
    await admin
      .from("ms_campaigns")
      .update({ status, sent_count: counts.sent, failed_count: counts.failed, finished_at: new Date().toISOString() })
      .eq("id", campaignId);
    sentTotal += sent;
    failedTotal += failed;
  }

  return NextResponse.json({ ok: true, processed, sent: sentTotal, failed: failedTotal, skipped: skippedTotal });
}
