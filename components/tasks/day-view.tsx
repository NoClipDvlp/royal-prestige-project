"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { StatusToggle } from "@/components/tasks/status-toggle";
import { RecurrenceEditDialog } from "@/components/tasks/recurrence-edit-dialog";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { DayItem } from "@/lib/tasks/types";

/**
 * Vista de día con franja 8–22; cada ocurrencia con toggle de estado y edición (popup recurrente).
 * `onRangeSelect`: arrastrar (o un click) sobre las franjas selecciona un rango y devuelve la hora
 * de INICIO — estilo Google Calendar — para prellenar el alta rápida.
 */
export function DayView({
  items,
  date,
  onRangeSelect,
}: {
  items: DayItem[];
  date: string;
  onRangeSelect?: (startHour: number) => void;
}) {
  const [editing, setEditing] = useState<DayItem | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const hours = Array.from({ length: WORKDAY_END - WORKDAY_START + 1 }, (_, i) => WORKDAY_START + i);

  // Soltar en cualquier parte finaliza el arrastre y prellena la hora de inicio.
  useEffect(() => {
    if (dragStart === null) return;
    function onUp() {
      if (dragStart !== null) onRangeSelect?.(Math.min(dragStart, dragEnd ?? dragStart));
      setDragStart(null);
      setDragEnd(null);
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [dragStart, dragEnd, onRangeSelect]);

  const inRange = (h: number) =>
    dragStart !== null &&
    dragEnd !== null &&
    h >= Math.min(dragStart, dragEnd) &&
    h <= Math.max(dragStart, dragEnd);

  return (
    <>
      <GlassCard className="p-2">
        <ul className="divide-y divide-white/40 dark:divide-white/10">
          {hours.map((h) => {
            const hourItems = items.filter(
              (it) => it.timeSlot != null && Number.parseInt(it.timeSlot, 10) === h,
            );
            return (
              <li
                key={h}
                onPointerDown={(e) => {
                  if (!onRangeSelect) return;
                  if ((e.target as HTMLElement).closest("button")) return; // no interferir con los toggles
                  setDragStart(h);
                  setDragEnd(h);
                }}
                onPointerEnter={() => {
                  if (dragStart !== null) setDragEnd(h);
                }}
                className={cn(
                  "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
                  onRangeSelect && "cursor-pointer select-none",
                  inRange(h) && "bg-accent/10",
                )}
              >
                <span className="w-12 shrink-0 pt-1.5 text-xs text-muted">{String(h).padStart(2, "0")}:00</span>
                <div className="flex-1 space-y-1.5">
                  {hourItems.length === 0 ? (
                    <span className="text-sm text-muted/40">—</span>
                  ) : (
                    hourItems.map((it) => (
                      <div key={it.taskId} className="flex items-center gap-2">
                        <span className="flex-1 text-sm text-fg">{it.title}</span>
                        <StatusToggle taskId={it.taskId} date={it.date} status={it.status} />
                        <button
                          type="button"
                          onClick={() => setEditing(it)}
                          aria-label="Editar tarea"
                          className="text-muted transition hover:text-fg"
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </GlassCard>
      <RecurrenceEditDialog open={editing != null} item={editing} onClose={() => setEditing(null)} />
    </>
  );
}
