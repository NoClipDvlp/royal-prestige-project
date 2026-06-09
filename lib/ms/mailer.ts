import "server-only"; // ⚠ jamás al cliente

import { serverEnv } from "@/lib/env";

// Adaptador de envío MASIVO (ADR-0027 §0/§4). Resend vía fetch (sin SDK → menos deps, control total).
// AISLADO del SMTP de auth (lib/email/mailer.ts): From por @mail.pistacore.com + Reply-To al alias → la
// reputación del masivo no toca el canal de OTP. Endpoint BATCH (≤100/llamada) = el tope del lote (ADR §5),
// así que el "throttle" es una sola llamada por lote (lo chunkeamos por 100 por prudencia).

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const BATCH_SIZE = 100;

export type MsOutMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  unsubUrl?: string; // List-Unsubscribe one-click
};
export type MsSendResult = { ok: boolean; id?: string; error?: string };

async function sendOneBatch(apiKey: string, from: string, replyTo: string, msgs: MsOutMessage[]): Promise<MsSendResult[]> {
  const payload = msgs.map((m) => ({
    from,
    to: [m.to],
    reply_to: replyTo,
    subject: m.subject,
    html: m.html,
    ...(m.text ? { text: m.text } : {}),
    ...(m.unsubUrl
      ? {
          headers: {
            "List-Unsubscribe": `<${m.unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  }));

  let res: Response;
  try {
    res = await fetch(RESEND_BATCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return msgs.map(() => ({ ok: false, error: `red: ${(e as Error).message}` }));
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return msgs.map(() => ({ ok: false, error: `Resend ${res.status}: ${t.slice(0, 180)}` }));
  }
  const json = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
  const ids = json?.data ?? [];
  return msgs.map((_, i) => (ids[i]?.id ? { ok: true, id: ids[i].id } : { ok: false, error: "sin id de proveedor" }));
}

/** Envía en lotes de ≤100 preservando el orden 1:1 con `messages`. Lanza solo si falta la API key. */
export async function sendMsBatch(messages: MsOutMessage[]): Promise<MsSendResult[]> {
  if (messages.length === 0) return [];
  const apiKey = serverEnv.msMailApiKey(); // lanza si no está configurada (claro para el caller)
  const from = serverEnv.msMailFrom();
  const replyTo = serverEnv.msMailReplyTo();
  const out: MsSendResult[] = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    out.push(...(await sendOneBatch(apiKey, from, replyTo, chunk)));
  }
  return out;
}

/** ¿Está configurado el proveedor? (para que la UI avise sin lanzar). */
export function msMailConfigured(): boolean {
  return Boolean(process.env.MS_MAIL_API_KEY);
}
