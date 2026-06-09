// Helpers de hora/franja (fuente única). La franja de trabajo es 8:00–22:00 (WORKDAY_START/END).

import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";

export const WORKDAY_START_MIN = WORKDAY_START * 60; // 480
export const WORKDAY_END_MIN = WORKDAY_END * 60; // 1320

/** "HH:MM" → minutos desde medianoche. Tolera "HH:MM:SS". */
export function hhmmToMin(s: string): number {
  const [h, m] = s.slice(0, 5).split(":");
  return Number.parseInt(h, 10) * 60 + (Number.parseInt(m, 10) || 0);
}

/** minutos → "HH:MM". */
export function minToHhmm(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
