"use client";

import { useState } from "react";
import { QuickAdd } from "@/components/tasks/quick-add";
import { DayView } from "@/components/tasks/day-view";
import { TaskCreateModal, type TaskCategory } from "@/components/tasks/task-create-modal";
import { WORKDAY_END } from "@/lib/constants";
import type { DayItem } from "@/lib/tasks/types";

/**
 * Une el alta (QuickAdd inline + modal drag-create) con la vista de día.
 * - Crear/editar/borrar: SIEMPRE activo, cualquier día (ADR-0022, se quitó el candado de día futuro).
 * - `canMarkStatus`: marcar estado solo en días con instancia (hoy/pasado). El futuro se planifica; el
 *   estado se marca cuando llega el día (sin materialize-on-demand → no-core).
 */
export function TareasBoard({
  items,
  date,
  canMarkStatus,
  categories,
}: {
  items: DayItem[];
  date: string;
  canMarkStatus: boolean;
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

      <DayView
        items={items}
        editable
        canMarkStatus={canMarkStatus}
        onRangeCreate={(start, end) => {
          const duration = Math.min((end - start + 1) * 60, (WORKDAY_END - start) * 60) || null;
          openModal(start, duration);
        }}
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
