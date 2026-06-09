"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { X, Plus } from "lucide-react";
import { ModalCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WeekdayPicker } from "@/components/tasks/weekday-picker";
import { createTask } from "@/lib/actions/tasks";
import { WORKDAY_END_MIN, WORKDAY_START_MIN, hhmmToMin, minToHhmm } from "@/lib/tasks/time";
import {
  PRIORITY_LABEL,
  RECURRENCE_LABEL,
  type TaskPriority,
  type TaskRecurrence,
} from "@/lib/tasks/types";

export type TaskCategory = { id: string; name: string };

/**
 * Modal de creación estilo Google Calendar: título / hora / duración / recurrencia / prioridad / categoría.
 * Lo abre el drag sobre la franja en /tareas (hora+duración prellenadas) y el "+ Nueva tarea" del home.
 * La validación de duración (inicio+dur ≤ 22:00) espeja el CHECK de la DB para feedback inmediato.
 */
export function TaskCreateModal({
  open,
  date,
  startHour = 9,
  durationMin = null,
  categories,
  onClose,
}: {
  open: boolean;
  date: string;
  startHour?: number;
  durationMin?: number | null;
  categories: TaskCategory[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(minToHhmm(startHour * 60)); // "HH:MM"
  const [end, setEnd] = useState<string>(durationMin ? minToHhmm(startHour * 60 + durationMin) : ""); // "" = sin duración
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("once");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [onceDate, setOnceDate] = useState(date); // día de la tarea "una vez" (cualquier fecha)
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [categoryId, setCategoryId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  // Resincroniza con lo que trae el drag cada vez que se abre (hora/duración del rango).
  useEffect(() => {
    if (!open) return;
    setStart(minToHhmm(startHour * 60));
    setEnd(durationMin ? minToHhmm(startHour * 60 + durationMin) : "");
    setOnceDate(date);
    setTitle("");
    setError(null);
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, startHour, durationMin, date]);

  if (!open) return null;

  const startMin = hhmmToMin(start);
  const endMin = end ? hhmmToMin(end) : null;
  const invalidStart = !start || startMin < WORKDAY_START_MIN || startMin >= WORKDAY_END_MIN;
  const invalidEnd = endMin != null && (endMin <= startMin || endMin > WORKDAY_END_MIN);

  function handle(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (invalidStart) {
      setError("La hora de inicio debe estar entre 08:00 y 22:00.");
      return;
    }
    if (invalidEnd) {
      setError("La hora de fin debe ser posterior al inicio y no pasar de las 22:00.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createTask({
        title: title.trim(),
        recurrence,
        startDate: recurrence === "once" ? onceDate : date, // once: el día elegido; recurrente: arranca hoy/visible
        timeSlot: start,
        durationMinutes: endMin != null ? endMin - startMin : null,
        priority,
        categoryId: categoryId || null,
        weekdays: recurrence === "weekly" ? weekdays : null, // ADR-0019
      });
      if (!res.ok) setError(res.error ?? "No se pudo crear la tarea.");
      else onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <ModalCard className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Nueva tarea</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted transition hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handle} className="space-y-3">
          <label className="space-y-1">
            <span className="px-1 text-[11px] text-muted">Título</span>
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="¿Qué hay que hacer?"
              aria-label="Título de la tarea"
            />
          </label>

          <div className="space-y-1">
            <span className="px-1 text-[11px] text-muted">Horario (8:00–22:00)</span>
            <div className="flex items-center gap-2">
              <Input type="time" min="08:00" max="22:00" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Hora de inicio" className="flex-1" required />
              <span className="shrink-0 text-xs text-muted">a</span>
              <Input type="time" min="08:00" max="22:00" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Hora de fin" className="flex-1" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {([["30 min", 30], ["1 h", 60], ["1 h 30", 90], ["2 h", 120]] as const).map(([label, m]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEnd(minToHhmm(Math.min(WORKDAY_END_MIN, hhmmToMin(start) + m)))}
                  className="rounded-lg border border-white/60 bg-white/40 px-2 py-0.5 text-[11px] text-muted transition hover:text-fg dark:border-white/10 dark:bg-white/5"
                >
                  {label}
                </button>
              ))}
              {end ? (
                <button type="button" onClick={() => setEnd("")} className="ml-auto text-[11px] text-muted transition hover:text-fg">
                  Sin duración
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <label className="space-y-1">
              <span className="px-1 text-[11px] text-muted">Prioridad</span>
              <Select
                className="w-full"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                aria-label="Prioridad"
              >
                {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          {recurrence === "weekly" && (
            <label className="space-y-1">
              <span className="px-1 text-[11px] text-muted">Días de la semana</span>
              <WeekdayPicker value={weekdays} onChange={setWeekdays} />
            </label>
          )}

          {recurrence === "once" && (
            <label className="space-y-1">
              <span className="px-1 text-[11px] text-muted">Día</span>
              <Input type="date" value={onceDate} onChange={(e) => setOnceDate(e.target.value)} aria-label="Día de la tarea" />
            </label>
          )}

          <label className="space-y-1">
            <span className="px-1 text-[11px] text-muted">Categoría</span>
            <Select className="w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoría">
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>

          {error ? <p className="text-xs text-red-500">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !title.trim() || invalidStart || invalidEnd}>
              <Plus size={16} /> Crear tarea
            </Button>
          </div>
        </form>
      </ModalCard>
    </div>
  );
}
