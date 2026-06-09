// Render de merge fields del módulo MS (ADR-0027 §4). PURO (testeable, sin imports).
// Sintaxis: {Campo} donde Campo = nombre de columna del dataset. Asunto y cuerpo soportan merge.
// SEGURIDAD: el HTML de la plantilla lo escribe el distribuidor (confiable), pero los VALORES vienen de
// un CSV subido (NO confiable) → en el cuerpo HTML se ESCAPAN; en el asunto (texto plano de cabecera) no.

const TOKEN_RE = /\{([^{}\n]+)\}/g;

/** Escape HTML de un valor de dato (espeja lib/email/mailer.ts:esc). */
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** Tokens DISTINTOS presentes en un texto (sin llaves), en orden de aparición. */
export function extractTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const key = m[1].trim();
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Tokens del texto que NO tienen valor (o vacío) en `fields` — para avisar en el preview. */
export function missingTokens(text: string, fields: Record<string, string>): string[] {
  return extractTokens(text).filter((k) => !fields[k] || fields[k].trim() === "");
}

function substitute(text: string, fields: Record<string, string>, esc: boolean): string {
  return text.replace(TOKEN_RE, (_full, raw) => {
    const v = fields[String(raw).trim()] ?? "";
    return esc ? escapeHtml(v) : v;
  });
}

/** Asunto renderizado (texto plano: sin escape, es cabecera de email). */
export function renderSubject(template: string, fields: Record<string, string>): string {
  return substitute(template, fields, false);
}

/** Cuerpo HTML renderizado (los valores de merge se ESCAPAN; el markup de la plantilla se respeta). */
export function renderHtmlBody(template: string, fields: Record<string, string>): string {
  return substitute(template, fields, true);
}

/** Texto plano alterno derivado del HTML (para multipart): quita etiquetas y normaliza espacios. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
