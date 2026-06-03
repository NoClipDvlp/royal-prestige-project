import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed, CircleDotDashed } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Greeting } from "@/components/greeting";
import { TodayTasks } from "@/components/dashboard/today-tasks";
import { cn } from "@/lib/cn";
import type { WeekSummary } from "@/lib/dashboard/week";
import type { DayItem } from "@/lib/tasks/types";

/** Dashboard del distribuidor con datos reales (ADR-0009). Presentacional: recibe lo ya computado. */
export function DistributorDashboard({
  name,
  summary,
  pendingToday,
  today,
  date,
}: {
  name: string;
  summary: WeekSummary;
  pendingToday: number;
  today: DayItem[];
  date: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <GlassCard className="p-6">
        <Greeting name={name} goalPct={summary.goalPct} pending={pendingToday} />
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Meta semanal</span>
            <span>{summary.goalPct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${summary.goalPct}%` }} />
          </div>
        </div>
      </GlassCard>

      <div>
        <p className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Esta semana</p>
        <div className="grid grid-cols-3 gap-5">
          <Stat label="Hechas" value={summary.done} icon={<CheckCircle2 size={18} />} />
          <Stat label="A medias" value={summary.half} icon={<CircleDotDashed size={18} />} />
          <Stat label="Pendientes" value={summary.pending} icon={<CircleDashed size={18} />} />
        </div>
      </div>

      <TodayTasks items={today} date={date} />
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <GlassCard className={cn("flex flex-col gap-1 p-6")}>
      <span className="text-muted">{icon}</span>
      <span className="text-2xl font-semibold text-fg">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </GlassCard>
  );
}
