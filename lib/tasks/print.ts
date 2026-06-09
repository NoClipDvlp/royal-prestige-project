// Construcción de la matriz HORA×día para la impresión del cronograma semanal (ADR/print, no-core).
// PURO (sin Supabase/React) → unit-testable. El page carga los datos y llama buildWeekMatrix.

import type { DayItem, TaskPriority } from "@/lib/tasks/types";

export const PRINT_PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Emoji por palabra clave del TÍTULO (heurística; fallback •). Royal Prestige = cocina → demo = 🍳. */
export function taskEmoji(title: string): string {
  const t = (title || "").toLowerCase();
  if (/(demostraci|demo\b|cocina|receta|almuerzo|cena)/.test(t)) return "🍳";
  if (/(llamad|teléfon|telefon|llamar|whatsapp|mensaj)/.test(t)) return "📞";
  if (/(seguimiento|posventa)/.test(t)) return "🔁";
  if (/(cita|reuni|cliente|visita|referid|prospecto)/.test(t)) return "🤝";
  if (/(entrega|pedido|despacho|accesori)/.test(t)) return "📦";
  if (/(cobro|pago|cuota|cierre|venta|factur)/.test(t)) return "💰";
  if (/(prospec|captaci|ronda)/.test(t)) return "🎯";
  if (/(reporte|informe|admin|inventario|plan)/.test(t)) return "📋";
  return "•";
}

export type MatrixRow = {
  hour: number; // 0–23
  label: string; // "HH:00"
  gapBefore: boolean; // salto de horas no consecutivas respecto a la fila anterior
  cells: DayItem[][]; // longitud 7 (lun…dom); cada celda = tareas de esa (hora,día), ordenadas
};

export type WeekMatrix = {
  rows: MatrixRow[];
  sinHora: DayItem[][] | null; // longitud 7, o null si ningún día tiene tareas sin hora
  hasAny: boolean; // false → semana vacía (mostrar mensaje)
};

const hourOf = (timeSlot: string): number => Number.parseInt(timeSlot.slice(0, 2), 10);
const fmtHour = (h: number): string => `${String(h).padStart(2, "0")}:00`;

const byTimeThenPriority = (a: DayItem, b: DayItem): number =>
  (a.timeSlot ?? "").localeCompare(b.timeSlot ?? "") ||
  PRINT_PRIORITY_ORDER[a.priority] - PRINT_PRIORITY_ORDER[b.priority];

/**
 * Matriz hora×día comprimida: solo las HORAS con ≥1 tarea en algún día; marca el salto entre horas no
 * consecutivas; banda "Sin hora" aparte. `days` = 7 arreglos (lunes…domingo).
 */
export function buildWeekMatrix(days: DayItem[][]): WeekMatrix {
  const hoursSet = new Set<number>();
  for (const day of days) for (const it of day) if (it.timeSlot) hoursSet.add(hourOf(it.timeSlot));
  const hours = [...hoursSet].sort((a, b) => a - b);

  const rows: MatrixRow[] = hours.map((h, i) => ({
    hour: h,
    label: fmtHour(h),
    gapBefore: i > 0 && h - hours[i - 1] > 1,
    cells: days.map((day) =>
      day.filter((it) => it.timeSlot && hourOf(it.timeSlot) === h).sort(byTimeThenPriority),
    ),
  }));

  const sinHoraCells = days.map((day) => day.filter((it) => !it.timeSlot).sort(byTimeThenPriority));
  const hasSinHora = sinHoraCells.some((c) => c.length > 0);

  return { rows, sinHora: hasSinHora ? sinHoraCells : null, hasAny: hours.length > 0 || hasSinHora };
}
