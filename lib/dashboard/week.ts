// Utilidades de fecha de rango. El cálculo del KPI ponderado vive AHORA en SQL (compliance_self /
// compliance_ranking, 0005 / ADR-0012) como fuente única — summarizeWeek se retiró para evitar drift.

/** Hoy en America/Bogota (YYYY-MM-DD), consistente con app_today() de la DB. */
export function bogotaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/** Lunes de la semana de `isoDate` (YYYY-MM-DD), en aritmética de fecha pura. */
export function weekStartMonday(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=domingo … 6=sábado
  const deltaToMonday = (dow + 6) % 7; // lunes=0
  d.setUTCDate(d.getUTCDate() - deltaToMonday);
  return d.toISOString().slice(0, 10);
}
