import "server-only"; // ⚠ jamás al cliente

import nodemailer, { type Transporter } from "nodemailer";
import { serverEnv } from "@/lib/env";

// Envío de correo (#3 alta de usuario) vía SMTP de Google Workspace (FROM info@pistacore.com).
// Corre en Server Actions (runtime Node de Vercel) — nodemailer es Node-only (net/tls), nunca Edge.

let _transport: Transporter | null = null;
function transport(): Transporter {
  if (_transport) return _transport;
  const port = serverEnv.smtpPort();
  _transport = nodemailer.createTransport({
    host: serverEnv.smtpHost(),
    port,
    secure: port === 465, // 465 = SSL implícito; 587 = STARTTLS
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

type WelcomeOpts = {
  to: string;
  fullName: string;
  role: string;
  distributionName?: string | null;
  setPasswordLink: string;
};

/** Correo de bienvenida con datos de cuenta + ROL + enlace para establecer contraseña (sin clave en texto). */
export async function sendWelcomeEmail(opts: WelcomeOpts): Promise<void> {
  const roleLabel = ROLE_LABEL[opts.role] ?? opts.role;
  await transport().sendMail({
    from: serverEnv.smtpFrom(),
    to: opts.to,
    subject: "Tu cuenta de Royal Control está lista",
    text: welcomeText({ ...opts, roleLabel }),
    html: welcomeHtml({ ...opts, roleLabel }),
  });
}

function welcomeText(o: WelcomeOpts & { roleLabel: string }): string {
  return [
    `Hola ${o.fullName},`,
    ``,
    `Tu cuenta de Royal Control ya está lista.`,
    ``,
    `Usuario: ${o.to}`,
    `Rol: ${o.roleLabel}${o.distributionName ? ` · ${o.distributionName}` : ""}`,
    ``,
    `Establece tu contraseña para entrar:`,
    o.setPasswordLink,
    ``,
    `Si no esperabas este correo, ignóralo.`,
    `— Pistacore`,
  ].join("\n");
}

function welcomeHtml(o: WelcomeOpts & { roleLabel: string }): string {
  const accent = "#6d6cf0";
  const fg = "#1b1f2e";
  const muted = "#6b7286";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef1f8;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${fg}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 34px -14px rgba(28,35,71,.30)">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #eef1f8">
        <span style="font-size:15px;font-weight:700;color:${fg}">Royal Control</span>
        <span style="font-size:12px;color:${muted}"> · Pistacore</span>
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 6px;font-size:20px;color:${fg}">Hola ${escapeHtml(o.fullName)},</h1>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:${muted}">Tu cuenta ya está lista. Estos son tus datos de acceso:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fc;border-radius:12px;padding:4px">
          <tr><td style="padding:10px 14px;font-size:13px;color:${muted}">Usuario</td><td style="padding:10px 14px;font-size:13px;color:${fg};text-align:right">${escapeHtml(o.to)}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:${muted};border-top:1px solid #e7ebf6">Rol</td><td style="padding:10px 14px;font-size:13px;color:${fg};text-align:right;border-top:1px solid #e7ebf6">${escapeHtml(o.roleLabel)}${o.distributionName ? ` · ${escapeHtml(o.distributionName)}` : ""}</td></tr>
        </table>
        <div style="text-align:center;margin:24px 0 8px">
          <a href="${o.setPasswordLink}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:14px">Establece tu contraseña</a>
        </div>
        <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${muted}">Por seguridad, eliges tu propia contraseña con ese enlace. Si no esperabas este correo, ignóralo.</p>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #eef1f8;font-size:11px;color:${muted}">© Pistacore · Royal Control</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
