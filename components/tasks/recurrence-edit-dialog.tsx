"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WeekdayPicker } from "@/components/tasks/weekday-picker";
import { updateTask, deleteTask } from "@/lib/actions/tasks";
import { RECURRENCE_LABEL, type DayItem, type EditScope, type TaskRecurrence } from "@/lib/tasks/types";

/**
 * Popup de edición (Google Calendar). Edita título + recurrencia + días (weekly). Nota 2 ADR-0019:
 * - Tarea RECURRENTE → 3 scopes (ADR-0007); recurrencia/días aplican a "este y siguientes" o "toda la serie"
 *   (en "solo este día" updateTask los ignora: una ocurrencia no tiene serie).
 * - Tarea ONCE → sin serie → un solo "Guardar" (que puede CONVERTIRLA a recurrente desde su start_date).
 */
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
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("once");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setRecurrence(item.recurrence);
      setWeekdays(item.weekdays ?? []);
    }
  }, [item]);

  if (!open || !item) return null;

  const wasRecurring = item.recurrence !== "once"; // los scopes dependen del tipo ORIGINAL

  function save(scope: EditScope) {
    if (!item) return;
    start(async () => {
      await updateTask(item.taskId, scope, item.date, { title, recurrence, weekdays });
      onClose();
    });
  }

  function del(scope: EditScope) {
    if (!item) return;
    start(async () => {
      await deleteTask(item.taskId, scope, item.date);
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

        <div className="space-y-3">
          <label className="space-y-1">
            <span className="px-1 text-[11px] text-muted">Título</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" aria-label="Título" />
          </label>

          <label className="space-y-1">
            <span className="px-1 text-[11px] text-muted">Recurrencia</span>
            <Select
              className="w-full"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
              aria-label="Recurrencia"
            >
              {(Object.keys(RECURRENCE_LABEL) as TaskRecurrence[]).map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_LABEL[r]}
                </option>
              ))}
            </Select>
          </label>

          {recurrence === "weekly" && (
            <div className="space-y-1">
              <span className="px-1 text-[11px] text-muted">Días de la semana</span>
              <WeekdayPicker value={weekdays} onChange={setWeekdays} />
            </div>
          )}
        </div>

        <div className="mt-5 space-y-2">
          {wasRecurring ? (
            <>
              <p className="text-xs text-muted">
                Tarea recurrente — aplica el cambio a:
                <br />
                <span className="text-muted/70">(recurrencia y días solo en “este y siguientes” o “toda la serie”)</span>
              </p>
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

        {/* Eliminar (NOTA-1): confirmación; scope en recurrentes; "once" un solo eliminar. */}
        <div className="mt-4 border-t border-white/40 pt-3 dark:border-white/10">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs font-medium text-red-500 transition hover:text-red-600"
            >
              Eliminar tarea
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-red-500">Esto no se puede deshacer. ¿Eliminar?</p>
              {wasRecurring ? (
                <>
                  <Button variant="danger" className="w-full justify-start" disabled={pending} onClick={() => del("this_day")}>
                    Eliminar solo este día
                  </Button>
                  <Button variant="danger" className="w-full justify-start" disabled={pending} onClick={() => del("this_and_following")}>
                    Eliminar este y los siguientes
                  </Button>
                  <Button variant="danger" className="w-full justify-start" disabled={pending} onClick={() => del("all")}>
                    Eliminar toda la serie
                  </Button>
                </>
              ) : (
                <Button variant="danger" className="w-full" disabled={pending} onClick={() => del("all")}>
                  Sí, eliminar
                </Button>
              )}
              <Button variant="ghost" className="w-full" disabled={pending} onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
