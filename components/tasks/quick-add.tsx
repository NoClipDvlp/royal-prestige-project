"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTask } from "@/lib/actions/tasks";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";
import { RECURRENCE_LABEL, type TaskRecurrence } from "@/lib/tasks/types";

const selectCls =
  "rounded-2xl border border-white/70 bg-white/50 px-3 py-2.5 text-sm text-fg outline-none dark:border-white/10 dark:bg-white/5";

/** Alta rápida (regla de oro): título + hora + recurrencia → una tarea en < 1 min, mínimos clicks. */
export function QuickAdd({ date }: { date: string }) {
  const [title, setTitle] = useState("");
  const [hour, setHour] = useState(9);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("once");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const hours = Array.from({ length: WORKDAY_END - WORKDAY_START + 1 }, (_, i) => WORKDAY_START + i);

  function handle(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    start(async () => {
      const res = await createTask({
        title: title.trim(),
        recurrence,
        startDate: date,
        timeSlot: `${String(hour).padStart(2, "0")}:00`,
        priority: "medium",
      });
      if (!res.ok) setError(res.error ?? "No se pudo crear la tarea.");
      else setTitle("");
    });
  }

  return (
    <form onSubmit={handle} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        placeholder="Nueva tarea…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="flex-1"
        aria-label="Título de la tarea"
      />
      <select className={selectCls} value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Hora">
        {hours.map((h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, "0")}:00
          </option>
        ))}
      </select>
      <select
        className={selectCls}
        value={recurrence}
        onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
        aria-label="Recurrencia"
      >
        {(Object.keys(RECURRENCE_LABEL) as TaskRecurrence[]).map((r) => (
          <option key={r} value={r}>
            {RECURRENCE_LABEL[r]}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending || !title.trim()}>
        <Plus size={16} /> Añadir
      </Button>
      {error ? <p className="text-xs text-red-500 sm:basis-full">{error}</p> : null}
    </form>
  );
}
