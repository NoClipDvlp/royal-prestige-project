// Utilidades de fecha PURAS (YYYY-MM-DD), ancladas a UTC-medianoche para no depender de la TZ local.
// El "hoy" del sistema es America/Bogota (lib/dashboard/week.ts:bogotaToday, = app_today() en DB).

/** Suma `n` días a una fecha ISO (YYYY-MM-DD). Aritmética de fecha pura. */
export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ¿Es una fecha ISO válida (YYYY-MM-DD) y real (round-trip)? */
export function isValidIsoDate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Etiqueta de día relativa a `today`: "Ayer" / "Hoy" / "Mañana"; si no, formato corto "lun 9 jun".
 * Anclado a UTC para que el formateo no se corra de día por la TZ del runtime.
 */
export function formatDayLabel(isoDate: string, today: string): string {
  if (isoDate === today) return "Hoy";
  if (isoDate === addDays(today, -1)) return "Ayer";
  if (isoDate === addDays(today, 1)) return "Mañana";
  return formatFullDay(isoDate);
}

/** Formato corto en español: "lun 9 jun" (capitalizado, sin coma). */
export function formatFullDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const raw = new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
  // "lun, 9 jun" / "lun., 9 sept." → limpia comas y puntos abreviados, capitaliza inicial.
  const clean = raw.replace(/,/g, "").replace(/\./g, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}
