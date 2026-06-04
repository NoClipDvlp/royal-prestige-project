"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useDensity } from "@/components/ui/density";
import { GlassCard } from "@/components/ui/card";
import { StatusToggle } from "@/components/tasks/status-toggle";
import { cn } from "@/lib/cn";
import { densityClasses, ROW_HOVER } from "@/lib/density";
import type { DayItem, TaskPriority } from "@/lib/tasks/types";

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: "bg-muted/60",
  medium: "bg-accent",
  high: "bg-red-500",
};

/**
 * Lista de tareas de HOY en el home (datos reales, RLS self). Reacciona al toggle de densidad
 * global (compacta/ampliada) del header (Hito 3). Cada tarea con su StatusToggle real.
 */
export function TodayTasks({
  items,
  date,
  action,
}: {
  items: DayItem[];
  date: string;
  action?: ReactNode;
}) {
  const { density } = useDensity();
  const d = densityClasses(density);
  const compact = d.compact;

  const sorted = [...items].sort((a, b) =>
    (a.timeSlot ?? "99:99").localeCompare(b.timeSlot ?? "99:99"),
  );

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-xs uppercase tracking-wide text-muted">
          Hoy · {items.length} {items.length === 1 ? "tarea" : "tareas"}
        </p>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-muted/70 sm:inline">
            {compact ? "Vista compacta" : "Vista ampliada"}
          </span>
          {action}
        </div>
      </div>

      {sorted.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-muted">
          No tienes tareas para hoy.{" "}
          <Link href="/tareas" className="font-medium text-accent hover:underline">
            Añadir una
          </Link>
          .
        </GlassCard>
      ) : (
        <GlassCard className={cn("divide-y divide-white/40 dark:divide-white/10", d.listPad)}>
          {sorted.map((it) => (
            <div key={it.taskId} className={cn("flex items-center rounded-xl", d.rowGap, d.rowPad, ROW_HOVER)}>
              <span className={cn("shrink-0 text-xs text-muted", compact ? "w-10" : "w-12")}>
                {it.timeSlot ?? "—"}
              </span>
              {d.showSecondary && (
                <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[it.priority])} aria-hidden />
              )}
              <span className={cn("flex-1 truncate text-fg", d.title)}>{it.title}</span>
              <StatusToggle taskId={it.taskId} date={it.date} status={it.status} />
            </div>
          ))}
        </GlassCard>
      )}
    </section>
  );
}
