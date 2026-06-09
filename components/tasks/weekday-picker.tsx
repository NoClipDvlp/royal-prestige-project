"use client";

import { cn } from "@/lib/cn";

// Días isodow 1=lun … 7=dom (coincide con el motor is_task_due / weekdays smallint[]).
const DAYS: { v: number; label: string; full: string }[] = [
  { v: 1, label: "L", full: "Lunes" },
  { v: 2, label: "M", full: "Martes" },
  { v: 3, label: "X", full: "Miércoles" },
  { v: 4, label: "J", full: "Jueves" },
  { v: 5, label: "V", full: "Viernes" },
  { v: 6, label: "S", full: "Sábado" },
  { v: 7, label: "D", full: "Domingo" },
];

/** Selector multi-día estilo Google Calendar (#6 ADR-0019). Solo para recurrence=weekly. value = isodow[]. */
export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const toggle = (d: number) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b));
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de la semana">
      {DAYS.map((d) => {
        const on = value.includes(d.v);
        return (
          <button
            key={d.v}
            type="button"
            onClick={() => toggle(d.v)}
            aria-pressed={on}
            aria-label={d.full}
            title={d.full}
            className={cn(
              "h-8 w-8 rounded-full text-xs font-medium transition active:scale-95",
              on ? "bg-accent text-accent-fg elev-1" : "glass text-muted hover:text-fg",
            )}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
