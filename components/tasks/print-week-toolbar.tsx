"use client";

import Link from "next/link";
import { Printer, ChevronLeft, ChevronRight } from "lucide-react";

/** Barra (no-print) para el cronograma de PLANTILLA: elegir la semana/rango y disparar la impresión.
 *  No auto-imprime (el admin primero elige la semana). `.no-print` la oculta en el papel/PDF. */
export function PrintWeekToolbar({
  prevHref,
  nextHref,
  weekLabel,
}: {
  prevHref: string;
  nextHref: string;
  weekLabel: string;
}) {
  return (
    <div className="no-print fixed left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white px-2 py-1.5 shadow-lg ring-1 ring-black/10">
      <Link href={prevHref} aria-label="Semana anterior" className="rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5">
        <ChevronLeft size={16} />
      </Link>
      <span className="px-2 text-xs font-medium text-[#1b1f2e]">{weekLabel}</span>
      <Link href={nextHref} aria-label="Semana siguiente" className="rounded-full p-1.5 text-[#1b1f2e] hover:bg-black/5">
        <ChevronRight size={16} />
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-[#6d6cf0] px-3 py-1.5 text-xs font-semibold text-white"
      >
        <Printer size={14} /> Imprimir
      </button>
    </div>
  );
}
