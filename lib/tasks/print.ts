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

// ── Layout tipo calendario (timeline) para el print "Google Calendar" ────────
const POINT_MIN = 30; // alto mínimo (min) de una tarea sin duración, solo para el bloque del timeline

export type PrintBlock = {
  item: DayItem;
  startMin: number; // minutos desde medianoche
  endMin: number; // start + duración (o POINT_MIN si no tiene)
  hasDuration: boolean;
  lane: number; // columna dentro del clúster de solape
  lanes: number; // nº de columnas del clúster
};

const toMin = (ts: string): number => {
  const [h, m] = ts.slice(0, 5).split(":");
  return Number.parseInt(h, 10) * 60 + (Number.parseInt(m, 10) || 0);
};

/** Asigna carriles (lanes) por clúster de solape, estilo Google Calendar (mismo algoritmo que DayView). */
export function layoutDay(items: DayItem[]): PrintBlock[] {
  const blocks: PrintBlock[] = items
    .filter((it) => it.timeSlot)
    .map((it) => {
      const startMin = toMin(it.timeSlot as string);
      const hasDuration = it.durationMinutes != null && it.durationMinutes > 0;
      const span = hasDuration ? (it.durationMinutes as number) : POINT_MIN;
      return { item: it, startMin, endMin: startMin + span, hasDuration, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  let group: PrintBlock[] = [];
  let columns: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = columns.length || 1;
    for (const b of group) b.lanes = lanes;
    group = [];
    columns = [];
    groupEnd = -1;
  };
  for (const b of blocks) {
    if (b.startMin >= groupEnd && group.length) flush();
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] <= b.startMin) {
        b.lane = i;
        columns[i] = b.endMin;
        placed = true;
        break;
      }
    }
    if (!placed) {
      b.lane = columns.length;
      columns.push(b.endMin);
    }
    group.push(b);
    groupEnd = Math.max(groupEnd, b.endMin);
  }
  if (group.length) flush();
  return blocks;
}

/** Ventana horaria [inicio, fin] (en horas redondas) que cubre TODAS las tareas con hora de la semana.
 *  null = no hay tareas con hora. Se usa para recortar el timeline al rango usado (sin espacio muerto). */
export function weekWindow(days: DayItem[][]): { startHour: number; endHour: number } | null {
  let s = Infinity;
  let e = -Infinity;
  for (const day of days)
    for (const it of day) {
      if (!it.timeSlot) continue;
      const st = toMin(it.timeSlot);
      const sp = it.durationMinutes && it.durationMinutes > 0 ? it.durationMinutes : POINT_MIN;
      s = Math.min(s, st);
      e = Math.max(e, st + sp);
    }
  if (s === Infinity) return null;
  return { startHour: Math.floor(s / 60), endHour: Math.ceil(e / 60) };
}

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
