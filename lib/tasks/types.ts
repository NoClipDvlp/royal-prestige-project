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
  durationMinutes: number | null; // null = "punto" en la franja (sin bloque); ADR-0011
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  weekdays?: number[] | null; // ADR-0019: días de la weekly (para pre-rellenar el editor de recurrencia)
  emoji?: string | null; // ADR-0024: emoji del ítem de plantilla (solo en el print de plantilla)
  status: StatusPct;
};

export const RECURRENCE_LABEL: Record<TaskRecurrence, string> = {
  once: "Una vez",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

/** Opciones de duración para el alta (null = punto, sin bloque). Visual/organizativo (ADR-0011 §1). */
export const DURATION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Sin duración (punto)" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 h" },
  { value: 90, label: "1 h 30" },
  { value: 120, label: "2 h" },
  { value: 180, label: "3 h" },
  { value: 240, label: "4 h" },
];
