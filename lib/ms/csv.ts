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
