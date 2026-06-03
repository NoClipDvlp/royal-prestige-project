"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateTask } from "@/lib/actions/tasks";
import type { DayItem, EditScope } from "@/lib/tasks/types";

/** Popup de edición estilo Google Calendar: para recurrentes, los 3 scopes de ADR-0007. */
export function RecurrenceEditDialog({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: DayItem | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (item) setTitle(item.title);
  }, [item]);

  if (!open || !item) return null;

  const recurring = item.recurrence !== "once";

  function save(scope: EditScope) {
    if (!item) return;
    start(async () => {
      await updateTask(item.taskId, scope, item.date, { title });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <GlassCard className="w-full max-w-sm p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Editar tarea</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted transition hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" aria-label="Título" />

        <div className="mt-5 space-y-2">
          {recurring ? (
            <>
              <p className="text-xs text-muted">Tarea recurrente — aplica el cambio a:</p>
              <Button variant="glass" className="w-full justify-start" disabled={pending} onClick={() => save("this_day")}>
                Solo este día
              </Button>
              <Button variant="glass" className="w-full justify-start" disabled={pending} onClick={() => save("this_and_following")}>
                Este y los siguientes
              </Button>
              <Button variant="primary" className="w-full justify-start" disabled={pending} onClick={() => save("all")}>
                Toda la serie
              </Button>
            </>
          ) : (
            <Button variant="primary" className="w-full" disabled={pending} onClick={() => save("all")}>
              Guardar
            </Button>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
