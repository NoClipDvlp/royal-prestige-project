// Layout tipo calendario (timeline) para la impresión del cronograma (ADR/print, no-core). PURO
// (sin Supabase/React). Carriles por solape (estilo Google Calendar) + ventana horaria del rango usado.

import type { DayItem } from "@/lib/tasks/types";

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

/** Ventana horaria [inicio, fin] (en horas redondas) que cubre TODAS las tareas con hora. null = sin tareas
 *  con hora. Recorta el timeline al rango usado (sin espacio muerto). */
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
