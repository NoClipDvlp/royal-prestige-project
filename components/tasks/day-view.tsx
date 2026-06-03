"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { StatusToggle } from "@/components/tasks/status-toggle";
import { RecurrenceEditDialog } from "@/components/tasks/recurrence-edit-dialog";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { DayItem, TaskPriority } from "@/lib/tasks/types";

const ROW_H = 72; // px por hora (aire entre horas — sensación premium, sin amontonar)
const POINT_MIN = 30; // minutos que ocupa un "punto" (sin duración) SOLO para el cálculo de solape
const PAD = 16; // aire arriba (antes de 08:00) y abajo (después de 22:00) dentro de la tarjeta
const GUTTER = "3.25rem"; // ancho del carril de etiquetas de hora

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: "bg-muted/60",
  medium: "bg-accent",
  high: "bg-red-500",
};

type Block = {
  item: DayItem;
  startMin: number;
  endMin: number; // para layout (usa POINT_MIN si no hay duración)
  hasDuration: boolean;
  lane: number;
  lanes: number;
};

/** Minutos desde medianoche de "HH:MM". */
function toMin(timeSlot: string): number {
  const [h, m] = timeSlot.split(":");
  return Number.parseInt(h, 10) * 60 + (Number.parseInt(m, 10) || 0);
}

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Asigna columnas (lanes) por clúster de solape, estilo Google Calendar. */
function layout(items: DayItem[]): Block[] {
  const blocks: Block[] = items
    .filter((it) => it.timeSlot != null)
    .map((it) => {
      const startMin = toMin(it.timeSlot as string);
      const hasDuration = it.durationMinutes != null && it.durationMinutes > 0;
      const span = hasDuration ? (it.durationMinutes as number) : POINT_MIN;
      return { item: it, startMin, endMin: startMin + span, hasDuration, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  let group: Block[] = [];
  let columns: number[] = []; // endMin por columna activa
  let groupEnd = -1;

  const flush = () => {
    const lanes = columns.length || 1;
    for (const b of group) b.lanes = lanes;
    group = [];
    columns = [];
    groupEnd = -1;
  };

  for (const b of blocks) {
    if (b.startMin >= groupEnd && group.length) flush();
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] <= b.startMin) {
        b.lane = i;
        columns[i] = b.endMin;
        placed = true;
        break;
      }
    }
    if (!placed) {
      b.lane = columns.length;
      columns.push(b.endMin);
    }
    group.push(b);
    groupEnd = Math.max(groupEnd, b.endMin);
  }
  if (group.length) flush();

  return blocks;
}

/**
 * Vista de día como timeline (franja 8–22): cada tarea con duración ocupa un bloque de alto ∝ duración
 * (coalesce instancia→task); solape = columnas apiladas. El drag sobre la franja selecciona un rango
 * (inicio + duración) y lo entrega a `onRangeCreate` (estilo Google Calendar). Sin `onRangeCreate`
 * (futuro/proyección) la vista es solo-lectura: sin drag, sin toggles, sin edición.
 */
export function DayView({
  items,
  editable = true,
  onRangeCreate,
}: {
  items: DayItem[];
  editable?: boolean;
  onRangeCreate?: (startHour: number, endHour: number) => void;
}) {
  const [editing, setEditing] = useState<DayItem | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: WORKDAY_END - WORKDAY_START + 1 }, (_, i) => WORKDAY_START + i);
  const gridSpan = (WORKDAY_END - WORKDAY_START) * ROW_H;
  const containerH = gridSpan + PAD * 2; // PAD de aire arriba y abajo (los "límites")
  const blocks = layout(items);
  const noTime = items.filter((it) => it.timeSlot == null);

  const hourFromY = (clientY: number): number => {
    const el = containerRef.current;
    if (!el) return WORKDAY_START;
    const y = clientY - el.getBoundingClientRect().top - PAD;
    const h = WORKDAY_START + Math.floor(y / ROW_H);
    return Math.min(WORKDAY_END - 1, Math.max(WORKDAY_START, h));
  };

  // Soltar en cualquier parte cierra el rango y dispara la creación.
  useEffect(() => {
    if (dragStart === null) return;
    function onUp() {
      if (dragStart !== null) {
        const a = Math.min(dragStart, dragEnd ?? dragStart);
        const b = Math.max(dragStart, dragEnd ?? dragStart);
        onRangeCreate?.(a, b);
      }
      setDragStart(null);
      setDragEnd(null);
    }
    function onMove(e: PointerEvent) {
      if (dragStart !== null) setDragEnd(hourFromY(e.clientY));
    }
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragStart, dragEnd, onRangeCreate]);

  const selTop =
    dragStart !== null && dragEnd !== null
      ? PAD + (Math.min(dragStart, dragEnd) - WORKDAY_START) * ROW_H
      : 0;
  const selH =
    dragStart !== null && dragEnd !== null
      ? (Math.abs(dragEnd - dragStart) + 1) * ROW_H
      : 0;

  return (
    <>
      <GlassCard className="p-2">
        <div ref={containerRef} className="relative" style={{ height: containerH }}>
          {/* Capa base: rejilla horaria + superficie de drag */}
          <div
            className={cn("absolute inset-0", onRangeCreate && "cursor-pointer select-none")}
            onPointerDown={(e) => {
              if (!onRangeCreate) return;
              const h = hourFromY(e.clientY);
              setDragStart(h);
              setDragEnd(h);
            }}
          >
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 flex items-start"
                style={{ top: PAD + (h - WORKDAY_START) * ROW_H, height: ROW_H }}
              >
                <span className="w-[3.25rem] shrink-0 -translate-y-1.5 pl-1 text-[11px] text-muted">
                  {String(h).padStart(2, "0")}:00
                </span>
                <div className="flex-1 border-t border-white/40 dark:border-white/10" />
              </div>
            ))}
            {selH > 0 && (
              <div
                className="pointer-events-none absolute rounded-xl bg-accent/15 ring-1 ring-accent/30"
                style={{ top: selTop, height: selH, left: GUTTER, right: "0.25rem" }}
              />
            )}
          </div>

          {/* Capa de bloques (no captura el puntero salvo en cada bloque) */}
          <div className="pointer-events-none absolute inset-0" style={{ paddingLeft: GUTTER }}>
            <div className="relative h-full pr-1">
              {blocks.map((b) => {
                const top = PAD + ((b.startMin - WORKDAY_START * 60) / 60) * ROW_H;
                const durH = b.hasDuration ? ((b.endMin - b.startMin) / 60) * ROW_H : 0;
                // Alto ∝ DURACIÓN, sin rebasar la franja: un bloque con duración mide exactamente su
                // duración (1h = ROW_H); un "punto" (sin duración) ocupa EXACTAMENTE una franja (1 fila).
                const naturalH = b.hasDuration ? durH : ROW_H;
                const avail = containerH - top - 2; // no desbordar la tarjeta por abajo
                const height = Math.max(24, Math.min(naturalH, avail));
                // Contenido proporcional al alto disponible (evita recortes en bloques cortos).
                const showTime = height >= 50;
                const showToggle = editable && height >= 66;
                const widthPct = 100 / b.lanes;
                const it = b.item;
                return (
                  <div
                    key={it.taskId}
                    className={cn(
                      "pointer-events-auto absolute flex flex-col gap-0.5 overflow-hidden rounded-xl border border-white/70 bg-white/55 p-1.5 shadow-sm backdrop-blur-sm",
                      "dark:border-white/10 dark:bg-white/10",
                      (it.status ?? 0) === 100 && "opacity-60",
                    )}
                    style={{
                      top,
                      height,
                      left: `calc(${b.lane * widthPct}% + ${b.lane === 0 ? 0 : 2}px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[it.priority])} aria-hidden />
                      <span className="flex-1 truncate text-[13px] font-medium leading-tight text-fg">{it.title}</span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => setEditing(it)}
                          aria-label="Editar tarea"
                          className="shrink-0 text-muted transition hover:text-fg"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                    {showTime && (
                      <span className="text-[10px] text-muted">
                        {fmt(b.startMin)}
                        {b.hasDuration ? `–${fmt(b.startMin + (it.durationMinutes as number))}` : ""}
                      </span>
                    )}
                    {showToggle && (
                      <div className="mt-auto">
                        <StatusToggle taskId={it.taskId} date={it.date} status={it.status} compact />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Tareas sin hora asignada (no caben en la franja) */}
      {noTime.length > 0 && (
        <GlassCard className="p-3">
          <p className="mb-2 px-1 text-[11px] uppercase tracking-wide text-muted">Sin hora</p>
          <div className="flex flex-col gap-1.5">
            {noTime.map((it) => (
              <div key={it.taskId} className="flex items-center gap-2 px-1">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[it.priority])} aria-hidden />
                <span className="flex-1 truncate text-sm text-fg">{it.title}</span>
                {editable && <StatusToggle taskId={it.taskId} date={it.date} status={it.status} />}
                {editable && (
                  <button
                    type="button"
                    onClick={() => setEditing(it)}
                    aria-label="Editar tarea"
                    className="text-muted transition hover:text-fg"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <RecurrenceEditDialog open={editing != null} item={editing} onClose={() => setEditing(null)} />
    </>
  );
}
