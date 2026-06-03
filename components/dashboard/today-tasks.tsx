"use client";

import Link from "next/link";
import { useDensity } from "@/components/ui/density";
import { GlassCard } from "@/components/ui/card";
import { StatusToggle } from "@/components/tasks/status-toggle";
import { cn } from "@/lib/cn";
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
export function TodayTasks({ items, date }: { items: DayItem[]; date: string }) {
  const { density } = useDensity();
  const compact = density === "compact";

  const sorted = [...items].sort((a, b) =>
    (a.timeSlot ?? "99:99").localeCompare(b.timeSlot ?? "99:99"),
  );

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs uppercase tracking-wide text-muted">
          Hoy · {items.length} {items.length === 1 ? "tarea" : "tareas"}
        </p>
        <span className="text-[11px] text-muted/70">{compact ? "Vista compacta" : "Vista ampliada"}</span>
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
        <GlassCard className={cn("divide-y divide-white/40 dark:divide-white/10", compact ? "p-1.5" : "p-2")}>
          {sorted.map((it) => (
            <div
              key={it.taskId}
              className={cn("flex items-center gap-3", compact ? "px-2 py-1.5" : "px-3 py-3")}
            >
              <span className={cn("shrink-0 text-xs text-muted", compact ? "w-10" : "w-12")}>
                {it.timeSlot ?? "—"}
              </span>
              {!compact && (
                <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[it.priority])} aria-hidden />
              )}
              <span className={cn("flex-1 truncate text-fg", compact ? "text-sm" : "text-sm sm:text-base")}>
                {it.title}
              </span>
              <StatusToggle taskId={it.taskId} date={it.date} status={it.status} />
            </div>
          ))}
        </GlassCard>
      )}
    </section>
  );
}
