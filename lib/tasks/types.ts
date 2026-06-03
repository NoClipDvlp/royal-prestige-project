export type TaskRecurrence = "once" | "daily" | "weekly" | "monthly";
export type TaskPriority = "low" | "medium" | "high";
export type EditScope = "this_day" | "this_and_following" | "all";
export type StatusPct = 0 | 50 | 100;

/** Ocurrencia de un día, con el contenido EFECTIVO (coalesce override de la instancia / task). */
export type DayItem = {
  taskId: string;
  date: string; // YYYY-MM-DD
  title: string;
  timeSlot: string | null; // HH:MM
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  status: StatusPct;
};

export const RECURRENCE_LABEL: Record<TaskRecurrence, string> = {
  once: "Una vez",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
};
