import { GlassCard } from "@/components/ui/card";
import { Greeting } from "@/components/greeting";
import { RefreshButton } from "@/components/metrics/refresh-button";
import { TodayTasks } from "@/components/dashboard/today-tasks";
import { QuickAddButton } from "@/components/dashboard/quick-add-button";
import type { TaskCategory } from "@/components/tasks/task-create-modal";
import type { ComplianceByRange } from "@/lib/metrics/types";
import type { DayItem } from "@/lib/tasks/types";

/**
 * Dashboard del distribuidor con datos reales (ADR-0009 + ADR-0012). Presentacional.
 * Saludo (meta semanal) + tareas de hoy. La tarjeta de cumplimiento se movió a /tareas (#9 QA Tanda 2):
 * el home queda sin ruido visual; en v2 se reactiva en home con métricas de EQUIPO.
 */
export function DistributorDashboard({
  name,
  compliance,
  today,
  date,
  categories,
}: {
  name: string;
  compliance: ComplianceByRange;
  today: DayItem[];
  date: string;
  categories: TaskCategory[];
}) {
  const weekPct = compliance.week.pct; // null = sin datos esta semana
  const pendingToday = compliance.day.half + compliance.day.undone;

  return (
    <div className="flex flex-col gap-5">
      <GlassCard className="p-6">
        <div className="flex items-start justify-between gap-3">
          <Greeting name={name} goalPct={weekPct} pending={pendingToday} />
          <RefreshButton label="Refrescar" />
        </div>
      </GlassCard>

      <TodayTasks
        items={today}
        date={date}
        action={<QuickAddButton date={date} categories={categories} />}
      />
    </div>
  );
}
