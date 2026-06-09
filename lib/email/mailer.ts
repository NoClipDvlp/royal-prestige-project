import "server-only"; // ⚠ jamás al cliente

import nodemailer, { type Transporter } from "nodemailer";
import { serverEnv } from "@/lib/env";

// Correo transaccional (Royal Control · Pistacore) vía SMTP de Google Workspace (FROM info@pistacore.com).
// Corre en Server Actions (runtime Node de Vercel). nodemailer es Node-only (net/tls), nunca Edge.

let _transport: Transporter | null = null;
function transport(): Transporter {
  if (_transport) return _transport;
  const port = serverEnv.smtpPort();
  _transport = nodemailer.createTransport({
    host: serverEnv.smtpHost(),
    port,
    secure: port === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user: serverEnv.smtpUser(), pass: serverEnv.smtpPass() },
  });
  return _transport;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  auditor: "Auditor",
  distributor: "Distribuidor",
  jd: "Jefe de distribución",
  seller: "Vendedor",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

type Block = {
  heading: string;
  intro: string;
  rows?: [string, string][]; // tabla clave/valor
  code?: string; // OTP de 6 dígitos (ADR-0023) — caja destacada, NO enlace clicable
  button?: { label: string; href: string };
  note?: string;
};

/** Render branded común (HTML + texto). Una sola fuente para todos los correos. */
function render(b: Block): { html: string; text: string } {
  const accent = "#6d6cf0", fg = "#1b1f2e", muted = "#6b7286";
  const rowsHtml = (b.rows ?? [])
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:10px 14px;font-size:13px;color:${muted}${i ? `;border-top:1px solid #e7ebf6` : ""}">${esc(k)}</td><td style="padding:10px 14px;font-size:13px;color:${fg};text-align:right${i ? `;border-top:1px solid #e7ebf6` : ""}">${esc(v)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef1f8;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${fg}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 34px -14px rgba(28,35,71,.30)">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #eef1f8"><span style="font-size:15px;font-weight:700;color:${fg}">Royal Control</span><span style="font-size:12px;color:${muted}"> · Pistacore</span></td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 6px;font-size:20px;color:${fg}">${esc(b.heading)}</h1>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:${muted}">${esc(b.intro)}</p>
        ${b.rows?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fc;border-radius:12px;padding:4px">${rowsHtml}</table>` : ""}
        ${b.code ? `<div style="text-align:center;margin:22px 0 6px"><div style="display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:10px;color:${fg};background:#f4f6fc;border:1px solid #e7ebf6;border-radius:14px;padding:14px 10px 14px 20px">${esc(b.code)}</div></div>` : ""}
        ${b.button ? `<div style="text-align:center;margin:${b.code ? "10px" : "24px"} 0 8px"><a href="${b.button.href}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:14px">${esc(b.button.label)}</a></div>` : ""}
        ${b.note ? `<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${muted}">${esc(b.note)}</p>` : ""}
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #eef1f8;font-size:11px;color:${muted}">© Pistacore · Royal Control</td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = [
    b.heading,
    "",
    b.intro,
    ...(b.rows ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(b.code ? ["", `Tu código: ${b.code}`] : []),
    ...(b.button ? ["", `${b.button.label}: ${b.button.href}`] : []),
    ...(b.note ? ["", b.note] : []),
    "",
    "— Pistacore",
  ].join("\n");
  return { html, text };
}

async function send(to: string, subject: string, b: Block): Promise<void> {
  const { html, text } = render(b);
  await transport().sendMail({ from: serverEnv.smtpFrom(), to, subject, html, text });
}

function roleRow(role: string, distributionName?: string | null): [string, string] {
  return ["Rol", `${ROLE_LABEL[role] ?? role}${distributionName ? ` · ${distributionName}` : ""}`];
}

// ── Correos ──────────────────────────────────────────────────────────────────

/** Alta por admin (ADR-0023): datos + ROL + CÓDIGO de 6 dígitos para establecer contraseña (código-only,
 *  sin enlace de verificación: el escáner de correo no puede pre-consumirlo). `otpUrl` es una URL normal de
 *  la app (sin token) para abrir la pantalla donde se teclea el código. */
export async function sendWelcomeEmail(o: { to: string; fullName: string; role: string; distributionName?: string | null; code: string; otpUrl: string }) {
  await send(o.to, "Tu cuenta de Royal Control está lista", {
    heading: `Hola ${o.fullName},`,
    intro: "Tu cuenta ya está lista. Para entrar, establece tu contraseña con este código:",
    rows: [["Usuario", o.to], roleRow(o.role, o.distributionName)],
    code: o.code,
    button: { label: "Establecer contraseña", href: o.otpUrl },
    note: "Abre la pantalla, escribe el código de 6 dígitos y elige tu contraseña. El código caduca: si expira, pide uno nuevo desde “¿Olvidaste tu contraseña?”. No compartas este código.",
  });
}

/** Reset por admin (ADR-0023): CÓDIGO para fijar una NUEVA contraseña (la anterior queda invalidada). Código-only. */
export async function sendResetEmail(o: { to: string; fullName: string; code: string; otpUrl: string }) {
  await send(o.to, "Restablece tu contraseña de Royal Control", {
    heading: `Hola ${o.fullName},`,
    intro: "Para crear una nueva contraseña, usa este código de 6 dígitos:",
    code: o.code,
    button: { label: "Crear nueva contraseña", href: o.otpUrl },
    note: "Abre la pantalla, escribe el código y elige tu contraseña. El código caduca; si expira, pide uno nuevo. No compartas este código.",
  });
}

/** Auto-registro: cuenta en revisión (sin rol todavía). */
export async function sendPendingReviewEmail(o: { to: string; fullName: string }) {
  await send(o.to, "Tu cuenta de Royal Control está en revisión", {
    heading: `Hola ${o.fullName},`,
    intro: "Recibimos tu registro. Tu cuenta está en revisión; te avisaremos por correo cuando un administrador te asigne un rol y puedas acceder.",
    note: "No necesitas hacer nada más por ahora.",
  });
}

/** Primera asignación de rol a un auto-registrado (camino B): bienvenida SIN enlace (ya tiene clave). */
export async function sendRoleAssignedEmail(o: { to: string; fullName: string; role: string; distributionName?: string | null }) {
  await send(o.to, "¡Bienvenido a Royal Control! Ya tienes acceso", {
    heading: `¡Felicidades, ${o.fullName}!`,
    intro: "Tu cuenta fue activada con un rol. Ya puedes iniciar sesión con tu contraseña y empezar a usar Royal Control.",
    rows: [roleRow(o.role, o.distributionName)],
    note: "Entra con el correo y la contraseña que registraste.",
  });
}

/** Cambio de rol posterior. */
export async function sendRoleChangedEmail(o: { to: string; fullName: string; role: string; distributionName?: string | null }) {
  await send(o.to, "Tu rol en Royal Control cambió", {
    heading: `Hola ${o.fullName},`,
    intro: "Un administrador actualizó tu rol. Tu nuevo acceso es:",
    rows: [roleRow(o.role, o.distributionName)],
  });
}

/** Aviso de seguridad: la contraseña fue cambiada. */
export async function sendPasswordChangedEmail(o: { to: string; fullName: string }) {
  await send(o.to, "Tu contraseña de Royal Control se cambió", {
    heading: `Hola ${o.fullName},`,
    intro: "Te confirmamos que la contraseña de tu cuenta se cambió correctamente.",
    note: "Si NO fuiste tú, contacta de inmediato a tu administrador: tu cuenta podría estar comprometida.",
  });
}
