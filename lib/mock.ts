// Datos MOCK para el shell del Hito 3. Sin Supabase, sin datos reales.
// Se reemplazarán por datos reales (vía RLS) en hitos posteriores.

export type MockUser = { name: string };
export const mockUser: MockUser = { name: "Nicolás" };

export const mockWeekly = {
  goalPct: 68,
  pending: 4,
  done: 17,
  half: 3,
  undone: 4,
};

export type MockTask = {
  id: string;
  title: string;
  time: string;
  status: 0 | 50 | 100;
  priority: "low" | "medium" | "high";
};

export const mockTasks: MockTask[] = [
  { id: "1", title: "Llamadas de seguimiento", time: "09:00", status: 100, priority: "high" },
  { id: "2", title: "Demostración a prospecto", time: "11:30", status: 50, priority: "high" },
  { id: "3", title: "Actualizar pipeline del día", time: "14:00", status: 0, priority: "medium" },
  { id: "4", title: "Cierre de inventario", time: "17:00", status: 0, priority: "low" },
];
