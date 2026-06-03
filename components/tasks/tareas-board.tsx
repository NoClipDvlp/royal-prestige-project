"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { QuickAdd } from "@/components/tasks/quick-add";
import { DayView } from "@/components/tasks/day-view";
import { TaskCreateModal, type TaskCategory } from "@/components/tasks/task-create-modal";
import { WORKDAY_END } from "@/lib/constants";
import type { DayItem } from "@/lib/tasks/types";

/**
 * Une el alta (QuickAdd inline + modal drag-create) con la vista de día.
 * - `editable` (past/hoy): drag sobre la franja abre el modal con hora+duración del rango; toggles y edición activos.
 * - no editable (futuro): proyección read-only desde el RPC; se conserva el alta (QuickAdd + modal) pero sin toggles.
 */
export function TareasBoard({
  items,
  date,
  editable,
  categories,
}: {
  items: DayItem[];
  date: string;
  editable: boolean;
  categories: TaskCategory[];
}) {
  const [modal, setModal] = useState<{ open: boolean; startHour: number; durationMin: number | null }>({
    open: false,
    startHour: 9,
    durationMin: null,
  });

  const openModal = (startHour: number, durationMin: number | null) =>
    setModal({ open: true, startHour, durationMin });

  return (
    <>
      <QuickAdd date={date} />

      {!editable && (
        <div className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/40 px-3 py-2 text-xs text-muted dark:border-white/10 dark:bg-white/5">
          <Lock size={13} /> Proyección · solo lectura (día futuro). Puedes crear tareas; el estado se marca el día en curso.
        </div>
      )}

      <DayView
        items={items}
        editable={editable}
        onRangeCreate={
          editable
            ? (start, end) => {
                const duration = Math.min((end - start + 1) * 60, (WORKDAY_END - start) * 60) || null;
                openModal(start, duration);
              }
            : undefined
        }
      />

      <TaskCreateModal
        open={modal.open}
        date={date}
        startHour={modal.startHour}
        durationMin={modal.durationMin}
        categories={categories}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
    </>
  );
}
