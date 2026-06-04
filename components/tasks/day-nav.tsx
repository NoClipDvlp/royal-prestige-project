"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addDays, formatDayLabel, formatFullDay } from "@/lib/tasks/dates";
import { cn } from "@/lib/cn";

/**
 * Navegación de días estilo app: ‹ › + "Hoy" + etiqueta Ayer/Hoy/Mañana (o "lun 9 jun").
 * La fecha vive en la URL (?d=YYYY-MM-DD) → server-render con la rama correcta (instancias vs RPC).
 */
export function DayNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const href = (iso: string) => (iso === today ? "/tareas" : `/tareas?d=${iso}`);
  const go = (iso: string) => router.push(href(iso));

  // Prefetch del RSC de día±1 → ‹ › saltan sin esperar al server (Pulido Tanda 2).
  useEffect(() => {
    router.prefetch(href(addDays(date, -1)));
    router.prefetch(href(addDays(date, 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, today]);

  const label = formatDayLabel(date, today);
  const full = formatFullDay(date);
  const isToday = date === today;

  return (
    <GlassCard className="flex items-center justify-between gap-2 px-3 py-2.5">
      <button
        type="button"
        onClick={() => go(addDays(date, -1))}
        aria-label="Día anterior"
        className="glass rounded-full p-2 text-muted transition hover:text-fg active:scale-95"
      >
        <ChevronLeft size={18} />
      </button>

      <div className="flex min-w-0 flex-col items-center text-center">
        <span className="truncate text-sm font-semibold text-fg">{label}</span>
        {label !== full && <span className="truncate text-[11px] text-muted">{full}</span>}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="glass"
          onClick={() => go(today)}
          disabled={isToday}
          className={cn("h-9 px-3 text-xs", isToday && "opacity-40")}
        >
          Hoy
        </Button>
        <button
          type="button"
          onClick={() => go(addDays(date, 1))}
          aria-label="Día siguiente"
          className="glass rounded-full p-2 text-muted transition hover:text-fg active:scale-95"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </GlassCard>
  );
}
