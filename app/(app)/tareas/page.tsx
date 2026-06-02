"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/card";
import { PageTitle } from "@/components/page-title";
import { useDensity } from "@/components/ui/density";
import { cn } from "@/lib/cn";
import { mockTasks } from "@/lib/mock";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";

const views = ["Día", "Semana", "Mes"] as const;
type View = (typeof views)[number];

export default function TareasPage() {
  const { density } = useDensity();
  const gap = density === "compact" ? "gap-3" : "gap-5";
  const [view, setView] = useState<View>("Día");
  const hours = Array.from({ length: WORKDAY_END - WORKDAY_START + 1 }, (_, i) => WORKDAY_START + i);

  return (
    <div className={cn("flex flex-col", gap)}>
      <PageTitle title="Tareas" subtitle="Organiza tu día por franjas. Mock — sin datos reales." />

      <div className="flex gap-1 self-start rounded-full glass p-1">
        {views.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition",
              view === v ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {view === "Día" ? (
        <GlassCard className="p-2">
          <ul className="divide-y divide-white/40 dark:divide-white/10">
            {hours.map((h) => {
              const task = mockTasks.find((t) => Number.parseInt(t.time, 10) === h);
              return (
                <li key={h} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-12 shrink-0 text-xs text-muted">
                    {String(h).padStart(2, "0")}:00
                  </span>
                  {task ? (
                    <span className="flex-1 text-sm text-fg">{task.title}</span>
                  ) : (
                    <span className="flex-1 text-sm text-muted/40">—</span>
                  )}
                </li>
              );
            })}
          </ul>
        </GlassCard>
      ) : (
        <GlassCard className="p-10 text-center text-sm text-muted">
          Vista <span className="font-medium text-fg">{view}</span> — placeholder. El calendario nativo
          (día/semana/mes) se conecta con la feature real en un hito posterior.
        </GlassCard>
      )}
    </div>
  );
}
