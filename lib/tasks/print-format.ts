// Formato de fechas EN ESPAÑOL para las vistas de impresión (fuente única; antes duplicado en las 2 páginas).

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DOW_FULL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export const dayNum = (iso: string): number => Number.parseInt(iso.slice(8, 10), 10);
const mIdx = (iso: string): number => Number.parseInt(iso.slice(5, 7), 10) - 1;
const yOf = (iso: string): string => iso.slice(0, 4);
/** Día de la semana 0=lun … 6=dom. */
export const isoDow = (iso: string): number => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/** "Semana del 8 al 14 de junio de 2026" (o con ambos meses si cruza). */
export function weekRange(weekStart: string, weekEnd: string): string {
  return mIdx(weekStart) === mIdx(weekEnd)
    ? `Semana del ${dayNum(weekStart)} al ${dayNum(weekEnd)} de ${MESES[mIdx(weekEnd)]} de ${yOf(weekEnd)}`
    : `Semana del ${dayNum(weekStart)} de ${MESES[mIdx(weekStart)]} al ${dayNum(weekEnd)} de ${MESES[mIdx(weekEnd)]} de ${yOf(weekEnd)}`;
}

/** "Lunes 8 de junio de 2026". */
export const longDay = (iso: string): string => `${DOW_FULL[isoDow(iso)]} ${dayNum(iso)} de ${MESES[mIdx(iso)]} de ${yOf(iso)}`;

/** "Impreso el 9 de junio de 2026 · Royal Control · Pistacore". */
export const printedLabel = (today: string): string => `Impreso el ${dayNum(today)} de ${MESES[mIdx(today)]} de ${yOf(today)} · Royal Control · Pistacore`;
