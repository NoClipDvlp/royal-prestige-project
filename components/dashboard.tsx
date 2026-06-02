"use client";

import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed, CircleDotDashed, Plus } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Greeting } from "@/components/greeting";
import { useDensity } from "@/components/ui/density";
import { mockTasks, mockWeekly } from "@/lib/mock";
import { cn } from "@/lib/cn";

export function Dashboard() {
  const { density } = useDensity();
  const pad = density === "compact" ? "p-4" : "p-6";
  const gap = density === "compact" ? "gap-3" : "gap-5";

  return (
    <div className={cn("flex flex-col", gap)}>
      {/* Saludo + progreso hacia meta semanal */}
      <GlassCard className={pad}>
        <Greeting />
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Meta semanal</span>
            <span>{mockWeekly.goalPct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${mockWeekly.goalPct}%` }} />
          </div>
        </div>
      </GlassCard>

      {/* Conteo hechas / a medias / pendientes */}
      <div className={cn("grid grid-cols-3", gap)}>
        <Stat label="Hechas" value={mockWeekly.done} pad={pad} icon={<CheckCircle2 size={18} />} />
        <Stat label="A medias" value={mockWeekly.half} pad={pad} icon={<CircleDotDashed size={18} />} />
        <Stat label="Pendientes" value={mockWeekly.undone} pad={pad} icon={<CircleDashed size={18} />} />
      </div>

      {/* Tareas de hoy (mock) */}
      <GlassCard className={pad}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Hoy</h2>
          <Button variant="primary" className="h-8 px-3 text-xs">
            <Plus size={14} /> Nueva tarea
          </Button>
        </div>
        <ul className="divide-y divide-white/40 dark:divide-white/10">
          {mockTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <StatusDot status={t.status} />
              <span className="w-12 shrink-0 text-xs text-muted">{t.time}</span>
              <span className="flex-1 text-sm text-fg">{t.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted">{t.priority}</span>
            </li>
          ))}
        </ul>
      </GlassCard>

      {/* Muestra del design system */}
      <GlassCard className={pad}>
        <h2 className="mb-3 text-sm font-semibold text-fg">Componentes</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primario</Button>
          <Button variant="glass">Glass</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <div className="mt-3">
          <Input placeholder="Buscar tarea…" />
        </div>
      </GlassCard>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  pad,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  pad: string;
}) {
  return (
    <GlassCard className={cn("flex flex-col gap-1", pad)}>
      <span className="text-muted">{icon}</span>
      <span className="text-2xl font-semibold text-fg">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </GlassCard>
  );
}

function StatusDot({ status }: { status: number }) {
  const tone =
    status === 100 ? "bg-positive" : status === 50 ? "bg-accent" : "border border-muted";
  return <span className={cn("h-3 w-3 shrink-0 rounded-full", tone)} />;
}
