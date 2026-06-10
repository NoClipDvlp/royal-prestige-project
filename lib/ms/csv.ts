// Ingesta CSV del módulo MS (ADR-0027 §3). Se parsea en el NAVEGADOR (preview instantáneo, sin subir el
// archivo crudo al servidor): el server action recibe solo las filas mapeadas. papaparse maneja comillas,
// delimitadores y encoding.
import Papa from "papaparse";

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test((s ?? "").trim());
}

/** Parsea un File CSV (header:true → filas como objeto por columna; valores recortados). */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const headers = (res.meta.fields ?? []).map((h) => h.trim()).filter(Boolean);
        const rows = (res.data ?? []).map((r) => {
          const o: Record<string, string> = {};
          for (const h of headers) o[h] = (r[h] ?? "").toString().trim();
          return o;
        });
        resolve({ headers, rows });
      },
      error: (err) => reject(err),
    });
  });
}

/** Heurística para la columna de email: por nombre de cabecera, si no por contenido (más emails válidos). */
export function guessEmailField(headers: string[], rows: Record<string, string>[]): string {
  const byName = headers.find((h) => /correo|e-?mail|mail/i.test(h));
  if (byName) return byName;
  let best = headers[0] ?? "";
  let bestScore = -1;
  for (const h of headers) {
    const score = rows.reduce((n, r) => n + (isValidEmail(r[h] ?? "") ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

// ── Limpieza de ingesta (#1, ADR-0027) — normaliza al importar; el preview es editable antes de guardar ──

/** Title Case simple: cada palabra con inicial mayúscula (sin obsesión con partículas). Soporta acentos. */
export function titleCase(s: string): string {
  return (s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\p{L}[\p{L}'-]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/** Hora a formato canónico "h:mm am/pm". Acepta "11", "1100", "11:30", "23h", "11 pm", "11:00 AM"… */
export function normalizeTime(s: string): string {
  const raw = (s ?? "").trim();
  if (!raw) return "";
  const m = raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").match(/^(\d{1,2})[:h ]?(\d{2})?\s*(a m|p m|am|pm)?$/);
  if (!m) return raw; // no parseable → respeta el original (ya trim)
  let h = Number.parseInt(m[1], 10);
  const min = m[2] ? Number.parseInt(m[2], 10) : 0;
  if (h > 23 || min > 59) return raw;
  const mer = m[3]?.replace(/\s/g, "");
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

const NAME_RE = /nombre|apellido|\bname\b|contacto/i;
const TIME_RE = /hora|horario|\btime\b/i;

/** Limpia un valor según su columna: hora→canónica, nombre→Title Case, resto→trim. */
export function cleanField(header: string, value: string): string {
  const v = (value ?? "").trim();
  if (TIME_RE.test(header)) return normalizeTime(v);
  if (NAME_RE.test(header)) return titleCase(v);
  return v;
}

/** Aplica cleanField a todas las celdas (al importar). El usuario aún puede ajustar en el preview. */
export function cleanRows(headers: string[], rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    for (const h of headers) o[h] = cleanField(h, r[h] ?? "");
    return o;
  });
}

export type BuiltRecipient = { email: string; fields: Record<string, string>; valid: boolean };

/** Valida email + deduplica case-insensitive (conserva el primero). Devuelve contadores para el preview. */
export function buildRecipients(
  rows: Record<string, string>[],
  emailField: string,
): { recipients: BuiltRecipient[]; duplicates: number; invalid: number } {
  const seen = new Set<string>();
  const recipients: BuiltRecipient[] = [];
  let duplicates = 0;
  let invalid = 0;
  for (const r of rows) {
    const email = (r[emailField] ?? "").trim();
    const key = email.toLowerCase();
    if (email && seen.has(key)) {
      duplicates += 1;
      continue;
    }
    if (email) seen.add(key);
    const valid = isValidEmail(email);
    if (!valid) invalid += 1;
    recipients.push({ email, fields: r, valid });
  }
  return { recipients, duplicates, invalid };
}
