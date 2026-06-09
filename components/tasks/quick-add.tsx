"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WeekdayPicker } from "@/components/tasks/weekday-picker";
import { createTask } from "@/lib/actions/tasks";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";
import { RECURRENCE_LABEL, type TaskRecurrence } from "@/lib/tasks/types";

/**
 * Alta rápida (regla de oro): título + hora + recurrencia → una tarea en < 1 min, mínimos clicks.
 * `hour`/`onHourChange` la hacen controlable (drag-create prellenan la hora); `focusSignal` enfoca
 * el título cuando cambia (al soltar el arrastre en /tareas).
 */
export function QuickAdd({
  date,
  hour: hourProp,
  onHourChange,
  focusSignal,
}: {
  date: string;
  hour?: number;
  onHourChange?: (h: number) => void;
  focusSignal?: number;
}) {
  const [title, setTitle] = useState("");
  const [hourInner, setHourInner] = useState(9);
  const hour = hourProp ?? hourInner;
  const setHour = (h: number) => (onHourChange ? onHourChange(h) : setHourInner(h));
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("once");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [onceDate, setOnceDate] = useState(date); // día de la tarea "una vez" (default: día visible)
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSignal && focusSignal > 0) titleRef.current?.focus();
  }, [focusSignal]);

  // Sigue al día visible del day-nav: si el usuario navega de día, el default de "una vez" se realinea.
  useEffect(() => {
    setOnceDate(date);
  }, [date]);

  const hours = Array.from({ length: WORKDAY_END - WORKDAY_START + 1 }, (_, i) => WORKDAY_START + i);

  function handle(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    start(async () => {
      const res = await createTask({
        title: title.trim(),
        recurrence,
        startDate: recurrence === "once" ? onceDate : date, // once: el día elegido; recurrente: arranca en el día visible
        timeSlot: `${String(hour).padStart(2, "0")}:00`,
        priority: "medium",
        weekdays: recurrence === "weekly" ? weekdays : null, // ADR-0019
      });
      if (!res.ok) setError(res.error ?? "No se pudo crear la tarea.");
      else {
        setTitle("");
        setWeekdays([]);
        setOnceDate(date); // vuelve al día visible para la siguiente alta
      }
    });
  }

  return (
    <form onSubmit={handle} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          ref={titleRef}
          placeholder="Nueva tarea…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1"
          aria-label="Título de la tarea"
        />
        <Select value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Hora">
          {hours.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </Select>
        <Select
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
        {recurrence === "once" && (
          <Input
            type="date"
            value={onceDate}
            onChange={(e) => setOnceDate(e.target.value)}
            aria-label="Día de la tarea"
            className="sm:w-auto"
          />
        )}
        <Button type="submit" disabled={pending || !title.trim()}>
          <Plus size={16} /> Añadir
        </Button>
      </div>
      {recurrence === "weekly" && <WeekdayPicker value={weekdays} onChange={setWeekdays} />}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </form>
  );
}
