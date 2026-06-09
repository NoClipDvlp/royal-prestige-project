"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { X, Plus } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createTask } from "@/lib/actions/tasks";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";
import {
  DURATION_OPTIONS,
  PRIORITY_LABEL,
  RECURRENCE_LABEL,
  type TaskPriority,
  type TaskRecurrence,
} from "@/lib/tasks/types";

export type TaskCategory = { id: string; name: string };

const WORKDAY_END_MIN = WORKDAY_END * 60; // tope de la franja (22:00 = 1320), espejo del CHECK de 0004

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
  const [hour, setHour] = useState(startHour);
  const [duration, setDuration] = useState<number | null>(durationMin);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("once");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [categoryId, setCategoryId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  // Resincroniza con lo que trae el drag cada vez que se abre (hora/duración del rango).
  useEffect(() => {
    if (!open) return;
    setHour(startHour);
    setDuration(durationMin);
    setTitle("");
    setError(null);
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, startHour, durationMin]);

  if (!open) return null;

  const hours = Array.from({ length: WORKDAY_END - WORKDAY_START + 1 }, (_, i) => WORKDAY_START + i);
  const overflowsFranja = duration != null && hour * 60 + duration > WORKDAY_END_MIN;

  function handle(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (overflowsFranja) {
      setError("La duración se pasa de las 22:00. Reduce la duración o adelanta la hora.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await createTask({
        title: title.trim(),
        recurrence,
        startDate: date,
        timeSlot: `${String(hour).padStart(2, "0")}:00`,
        durationMinutes: duration,
        priority,
        categoryId: categoryId || null,
      });
      if (!res.ok) setError(res.error ?? "No se pudo crear la tarea.");
      else onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard className="w-full max-w-md p-6">
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

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="px-1 text-[11px] text-muted">Hora</span>
              <Select className="w-full" value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Hora">
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="px-1 text-[11px] text-muted">Duración</span>
              <Select
                className="w-full"
                value={duration === null ? "" : String(duration)}
                onChange={(e) => setDuration(e.target.value === "" ? null : Number(e.target.value))}
                aria-label="Duración"
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value === null ? "" : String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
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
            <Button type="submit" disabled={pending || !title.trim() || overflowsFranja}>
              <Plus size={16} /> Crear tarea
            </Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
