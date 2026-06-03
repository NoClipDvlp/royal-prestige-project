"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { StatusToggle } from "@/components/tasks/status-toggle";
import { RecurrenceEditDialog } from "@/components/tasks/recurrence-edit-dialog";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";
import type { DayItem } from "@/lib/tasks/types";

/** Vista de día con franja 8–22; cada ocurrencia con toggle de estado y edición (popup recurrente). */
export function DayView({ items, date }: { items: DayItem[]; date: string }) {
  const [editing, setEditing] = useState<DayItem | null>(null);
  const hours = Array.from({ length: WORKDAY_END - WORKDAY_START + 1 }, (_, i) => WORKDAY_START + i);

  return (
    <>
      <GlassCard className="p-2">
        <ul className="divide-y divide-white/40 dark:divide-white/10">
          {hours.map((h) => {
            const hourItems = items.filter(
              (it) => it.timeSlot != null && Number.parseInt(it.timeSlot, 10) === h,
            );
            return (
              <li key={h} className="flex items-start gap-3 px-3 py-2.5">
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
