import type { TaskPriority } from "@/lib/tasks/types";

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

export const PRIORITY_WEIGHT: Record<TaskPriority, number> = { low: 1, medium: 2, high: 3 };

export type WeekRow = {
  status_pct: number | null;
  date: string;
  priority: TaskPriority | null; // override de la instancia
  taskPriority: TaskPriority | null; // del task
};

export type WeekSummary = {
  done: number;
  half: number;
  pending: number;
  /** % cumplimiento ponderado de lo TRANSCURRIDO (no penaliza días futuros). 0–100, redondeado. */
  goalPct: number;
};

/** Resume la semana transcurrida: conteos por estado + % ponderado por prioridad efectiva. */
export function summarizeWeek(rows: WeekRow[]): WeekSummary {
  let done = 0;
  let half = 0;
  let pending = 0;
  let weighted = 0;
  let weightTotal = 0;
  for (const r of rows) {
    const status = (r.status_pct ?? 0) as 0 | 50 | 100;
    if (status === 100) done += 1;
    else if (status === 50) half += 1;
    else pending += 1;
    const eff = (r.priority ?? r.taskPriority ?? "medium") as TaskPriority;
    const w = PRIORITY_WEIGHT[eff];
    weighted += w * (status / 100);
    weightTotal += w;
  }
  const goalPct = weightTotal === 0 ? 0 : Math.round((weighted / weightTotal) * 100);
  return { done, half, pending, goalPct };
}
