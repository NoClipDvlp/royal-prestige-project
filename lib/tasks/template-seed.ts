// Cálculo del start_date de una tarea SEMBRADA por una plantilla (ADR-0028). Función PURA y testeable.
// Vive fuera de lib/actions/templates.ts (que es "use server" → solo puede exportar async). Reusa los
// helpers de fecha existentes (lib/dashboard/week + lib/tasks/dates); NO reinventa el offset lunes-base
// ni la zona Bogotá (ADR-0028 §Riesgos: el riesgo del fix es justo ese cálculo → un solo origen).

import { weekStartMonday } from "@/lib/dashboard/week";
import { addDays } from "@/lib/tasks/dates";
import type { TaskRecurrence } from "@/lib/tasks/types";

/**
 * start_date con el que materializar una tarea de plantilla (ADR-0028):
 *
 * - once CON weekdays → el día (isodow de `weekdays[0]`, 1=lun…7=dom) DENTRO de la semana de `today`
 *   (lunes-base; la zona Bogotá ya viene resuelta en `today`). Si ese día YA pasó respecto a `today`
 *   → el mismo isodow de la SEMANA SIGUIENTE (la tarea no nace vencida). El día == today se queda en today.
 * - resto (once SIN weekdays, y recurrentes daily/weekly/monthly) → `today` (ancla de asignación, ADR-0015 §3).
 *
 * El motor (is_task_due) NO cambia: una once materializa por su start_date. Aquí solo se decide ese
 * start_date para que cada once caiga en su día del cronograma (igual que en la impresión del admin),
 * en vez de apilarse todas en la fecha de asignación. Comparación de fechas ISO = lexicográfica (segura).
 */
export function seedStartDate(
  today: string,
  recurrence: TaskRecurrence,
  weekdays: number[] | null | undefined,
): string {
  if (recurrence !== "once" || !weekdays || weekdays.length === 0) return today;
  const dow = weekdays[0]; // isodow 1=lun … 7=dom
  if (!Number.isInteger(dow) || dow < 1 || dow > 7) return today; // weekdays corrupto → fallback seguro
  const candidate = addDays(weekStartMonday(today), dow - 1); // lunes de la semana + (dow-1) días
  return candidate >= today ? candidate : addDays(candidate, 7); // ya pasó → mismo día, semana siguiente
}
