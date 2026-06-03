"use client";

import { useState } from "react";
import { QuickAdd } from "@/components/tasks/quick-add";
import { DayView } from "@/components/tasks/day-view";
import type { DayItem } from "@/lib/tasks/types";

/**
 * Une el alta rápida con la vista de día para el drag-create: al arrastrar (o click) sobre las
 * franjas, se prellena la hora en QuickAdd y se enfoca el título (el botón "+Añadir" sigue gateado
 * por título no vacío).
 */
export function TareasBoard({ items, date }: { items: DayItem[]; date: string }) {
  const [hour, setHour] = useState(9);
  const [focusSignal, setFocusSignal] = useState(0);

  return (
    <>
      <QuickAdd date={date} hour={hour} onHourChange={setHour} focusSignal={focusSignal} />
      <DayView
        items={items}
        date={date}
        onRangeSelect={(start) => {
          setHour(start);
          setFocusSignal((s) => s + 1);
        }}
      />
    </>
  );
}
