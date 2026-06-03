"use client";

import { useTransition } from "react";
import { setStatus } from "@/lib/actions/tasks";
import type { StatusPct } from "@/lib/tasks/types";
import { cn } from "@/lib/cn";

const OPTS: StatusPct[] = [0, 50, 100];

/**
 * Toggle de estado 0/50/100. `compact`: pills `flex-1` que ocupan TODO el ancho disponible y se
 * encogen para caber siempre (incl. el 100%) en bloques angostos del timeline (solape en móvil).
 */
export function StatusToggle({
  taskId,
  date,
  status,
  compact = false,
}: {
  taskId: string;
  date: string;
  status: StatusPct;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className={cn("flex items-center", compact ? "w-full gap-1" : "gap-1", pending && "opacity-50")}>
      {OPTS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => start(() => { void setStatus(taskId, date, p); })}
          className={cn(
            "rounded-full font-medium transition",
            compact ? "h-6 min-w-0 flex-1 px-1.5 text-[10px]" : "h-7 px-2.5 text-[11px]",
            status === p ? "bg-accent text-accent-fg" : "glass text-muted hover:text-fg",
          )}
        >
          {p}%
        </button>
      ))}
    </div>
  );
}
