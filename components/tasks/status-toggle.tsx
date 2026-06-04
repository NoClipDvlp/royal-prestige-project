"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStatus } from "@/lib/actions/tasks";
import { toast } from "@/lib/toast";
import type { StatusPct } from "@/lib/tasks/types";
import { cn } from "@/lib/cn";

const OPTS: StatusPct[] = [0, 50, 100];

/**
 * Toggle de estado 0/50/100. OPTIMISTA (ADR pulido Tanda 1): el pill cambia YA (useOptimistic), sin esperar
 * el round-trip. En éxito → router.refresh() reconcilia SOLO la ruta actual (el valor se fija); en fallo →
 * el optimista revierte solo al terminar la transición + toast. `compact`: pills flex-1 (timeline angosto).
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
  const router = useRouter();
  const [optimistic, setOptimistic] = useOptimistic<StatusPct, StatusPct>(status, (_, next) => next);
  const [, start] = useTransition();

  function set(p: StatusPct) {
    if (p === optimistic) return;
    start(async () => {
      setOptimistic(p); // instantáneo
      const r = await setStatus(taskId, date, p);
      if (r.ok) router.refresh(); // reconcilia la ruta actual (el optimista se fija al actualizar el prop)
      else toast("No se pudo guardar el estado", "error"); // el optimista revierte al terminar la transición
    });
  }

  return (
    <div className={cn("flex items-center", compact ? "w-full gap-1" : "gap-1")}>
      {OPTS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => set(p)}
          className={cn(
            "rounded-full font-medium transition",
            compact ? "h-6 min-w-0 flex-1 px-1.5 text-[10px]" : "h-7 px-2.5 text-[11px]",
            optimistic === p ? "bg-accent text-accent-fg" : "glass text-muted hover:text-fg",
          )}
        >
          {p}%
        </button>
      ))}
    </div>
  );
}
